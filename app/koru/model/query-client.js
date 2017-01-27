define(function(require, exports, module) {
  const Model    = require('koru/model/map');
  const session  = require('koru/session/client-rpc');
  const koru     = require('../main');
  const util     = require('../util');
  const dbBroker = require('./db-broker');

  function Constructor(session) {
    return function(Query, condition) {
      let syncOb, stateOb;

      util.merge(Query, {
        revertSimChanges() {
          const dbs = Model._databases[dbBroker.dbId];
          if (! dbs) return;

          for (let modelName in dbs) {
            const model = Model[modelName];
            const modelDocs = model && model.docs;
            if (! modelDocs) continue;
            const docs = dbs[modelName].simDocs;
            if (! docs) continue;
            dbs[modelName].simDocs = Object.create(null);
            for(let id in docs) {
              let doc = modelDocs[id];
              const fields = docs[id];
              if (fields === 'new') {
                if (id in modelDocs) {
                  delete modelDocs[id];

                  notify(model, null, doc, true);
                }
              } else {
                const newDoc = ! doc;
                if (newDoc)
                  doc = modelDocs[id] = new model({_id: id});
                util.applyChanges(doc.attributes, fields);
                for (let noop in fields) {
                  notify(model, doc, newDoc ? null : fields, true);
                  break;
                }
              }
            }
          }
        },

        insert(doc) {
          const model = doc.constructor;
          if (session.state.pendingCount()) {
            simDocsFor(model)[doc._id] = 'new';
          }
          model.docs[doc._id] = doc;
          notify(model, doc, null);
          return doc._id;
        },

        insertFromServer(model, id, attrs) {
          if (session.state.pendingCount()) {
            const changes = fromServer(model, id, attrs);
            const doc = model.docs[id];
            if (doc && changes !== attrs) { // found existing
              util.applyChanges(doc.attributes, changes);
              for (let noop in changes) {
                notify(model, doc, changes, true);
                break;
              }
              return doc._id;
            }
          }

          // otherwise new doc
          if (model.docs[id]) {
            // already exists; convert to update
            const old = model.docs[id].attributes;
            for (let key in old) {
              if (attrs.hasOwnProperty(key)) {
                if (util.deepEqual(old[key], attrs[key]))
                  delete attrs[key];
              } else {
                attrs[key] = undefined;
              }
            }
            model.serverQuery.onId(id).update(attrs);
          } else {
            // insert doc
            attrs._id = id;
            const doc = new model(attrs);
            model.docs[doc._id] = doc;
            notify(model, doc, null, true);
          }
        },

        // for testing
        _reset: reset,

        _unload: unload,
      });

      reset();

      const origWhere = Query.prototype.where;

      util.merge(Query.prototype, {
        get docs() {
          return this._docs || (this._docs = this.model.docs);
        },

        where(params, value) {
          if (typeof params === 'function') {
            const funcs = this._whereFuncs || (this._whereFuncs = []);
            funcs.push(params);
            return this;
          } else {
            const wheres = this._wheres || (this._wheres = {});
            if (typeof params === 'string') {
              value = exprToFunc(params, value);
              if (typeof value === 'function')
                return this.where(value);
            }
            return condition(this, '_wheres', params, value);
          }
        },

        withIndex(idx, params) {
          const orig = dbBroker.dbId;
          dbBroker.dbId = this._dbId || orig;
          this._index = idx(params) || {};
          dbBroker.dbId = orig;
          return this;
        },

        withDB(dbId) {
          const orig = dbBroker.dbId;
          dbBroker.dbId = dbId;
          this._dbId = dbId;
          this._docs = this.model.docs;
          dbBroker.dbId = orig;
          return this;
        },

        fromServer() {
          this.isFromServer = true;
          return this;
        },

        fetch() {
          const results = [];
          this.forEach(doc => {results.push(doc)});
          return results;
        },

        fetchIds() {
          const results = [];
          this.forEach(doc => {results.push(doc._id)});
          return results;
        },

        fetchOne() {
          let result;
          this.forEach(doc => (result = doc, true));
          return result;
        },

        show(func) {
          func(this);
          return this;
        },

        forEach(func) {
          if (this.singleId) {
            const doc = this.findOne(this.singleId);
            doc && func(doc);
          } else {
            if (this._sort) {
              const results = [];
              const compare = sortFunc(this._sort);
              findMatching.call(this, doc => results.push(doc));
              results.sort(compare).some(func);

            } else findMatching.call(this, func);
          }
        },

        map(func) {
          const results = [];
          this.forEach(doc => {results.push(func(doc))});
          return results;
        },

        count(max) {
          let count = 0;
          if (! this.model) return 0;
          const docs = this.docs;
          this.forEach(doc => ++count === max);
          return count;
        },

        exists() {
          return this.count(1) === 1;
        },

        findOne(id) {
          const doc = this.docs[id];
          if (! doc) return;
          const attrs = doc.attributes;

          if (this._whereNots && foundIn(this._whereNots, false)) return;

          if (this._wheres && ! foundIn(this._wheres)) return;

          if (this._whereFuncs && this._whereFuncs.some(func => ! func(doc)))
            return;

          if (this._whereSomes &&
              ! this._whereSomes.some(
                ors => ors.some(o => foundIn(o)))) return;

          return doc;

          function foundIn(fields, affirm) {
            if (affirm === undefined) affirm = true;
            for (let key in fields) {
              if (foundItem(attrs[key], fields[key]) !== affirm)
                return ! affirm;
            }
            return affirm;
          }
        },

        remove() {
          let count = 0;
          const self = this;
          const model = self.model;
          dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
            const docs = this.docs;
            if (session.state.pendingCount() && self.isFromServer) {
              if (fromServer(model, self.singleId, null) === null) {
                const doc = docs[self.singleId];
                delete docs[self.singleId];
                doc && notify(model, null, doc, self.isFromServer);
              }
              return 1;
            }
            self.forEach(doc => {
              ++count;
              Model._support.callBeforeObserver('beforeRemove', doc);
              if (session.state.pendingCount()) {
                recordChange(model, doc.attributes);
              }
              delete docs[doc._id];
              notify(model, null, doc, self.isFromServer);
            });
          });
          return count;
        },

        update(origChanges, value) {
          if (typeof origChanges === 'string') {
            const changes = {};
            changes[origChanges] = value;
            origChanges = changes;
          } else
            origChanges = origChanges || {};

          const self = this;
          let count = 0;
          const model = self.model;
          const docs = this.docs;
          let items;
          if (session.state.pendingCount() && self.isFromServer) {
            const changes = fromServer(model, self.singleId, origChanges);
            const doc = docs[self.singleId];
            if (doc) {
              util.applyChanges(doc.attributes, changes);
              dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
                for (let noop in changes) {
                  notify(model, doc, changes, self.isFromServer);
                  break;
                }
              });
            }
            return 1;
          }
          dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
            self.forEach(doc => {
              const changes = util.deepCopy(origChanges);
              ++count;
              const attrs = doc.attributes;

              if (self._incs) for (let field in self._incs) {
                changes[field] = attrs[field] + self._incs[field];
              }

              session.state.pendingCount() && recordChange(model, attrs, changes);
              util.applyChanges(attrs, changes);

              let itemCount = 0;

              if (items = self._addItems) for (let field in items) {
                const list = attrs[field] || (attrs[field] = []);
                util.forEach(items[field], item => {
                  if (util.addItem(list, item) == null) {
                    session.state.pendingCount() && recordItemChange(model, attrs, field);
                    changes[field + ".$-" + ++itemCount] = item;
                  }
                });
              }

              if (items = self._removeItems) for (let field in items) {
                const list = attrs[field];
                let match;
                util.forEach(items[field], item => {
                  if (list && (match = util.removeItem(list, item)) !== undefined) {
                    session.state.pendingCount() && recordItemChange(model, attrs, field);
                    changes[field + ".$+" + ++itemCount] = match;
                  }
                });
              }

              for (let key in changes) {
                notify(model, doc, changes, self.isFromServer);
                break;
              }
            });
          });
          return count;
        },
      });

      Query.prototype[Symbol.iterator] = function *() {
        if (this.singleId) {
          const doc = this.findOne(this.singleId);
          doc && (yield doc);
        } else {
          if (this._sort) {
            const results = [];
            const compare = sortFunc(this._sort);
            findMatching.call(this, doc => results.push(doc));
            yield *results.sort(compare);

          } else
            yield *g_findMatching(this);
        }
      };

      function *g_findMatching(q) {
        if (! q.model) return;

        if (q._index) {
          yield *g_findByIndex(q, q._index);

        } else for (let id in q.docs) {
          const doc = q.findOne(id);
          if (doc && (yield doc) === true)
            break;
        }
      }

      function *g_findByIndex(query, idx) {
        for (let key in idx) {
          const value = idx[key];
          if (typeof value === 'string') {
            const doc = query.findOne(value);
            if (doc && (yield doc) === true)
              return true;

          } else if (yield *g_findByIndex(query, value) === true)
            return true;
        }
      }

      function foundItem(value, expected) {
        if (typeof expected === 'object') {
          if (Array.isArray(expected)) {
            const av = Array.isArray(value);
            for (let i = 0; i < expected.length; ++i) {
              const exv = expected[i];
              if (av) {
                if (value.some(item => util.deepEqual(item, exv)))
                  return true;
              } else if (util.deepEqual(exv, value))
                return true;
            }
            return false;
          }
          if (Array.isArray(value))
            return value.some(item => util.deepEqual(item, expected));

        } else if (Array.isArray(value)) {
          return ! value.every(item => ! util.deepEqual(item, expected));
        }

        return util.deepEqual(expected, value);
      }

      function notify(model, doc, changes, isFromServer) {
        model._indexUpdate.notify(doc, changes); // first: update indexes
        isFromServer ||
          Model._support.callAfterObserver(doc, changes); // next:  changes originated here
        model.notify(doc, changes, isFromServer); // last:  Notify everything else
      }

      function findMatching(func) {
        if (! this.model) return;

        if (this._index) {
          findByIndex(this, this._index, func);

        } else for (let id in this.docs) {
          const doc = this.findOne(id);
          if (doc && func(doc) === true)
            break;
        }
      }

      function findByIndex(query, idx, func) {
        for (let key in idx) {
          const value = idx[key];
          if (typeof value === 'string') {
            const doc = query.findOne(value);
            if (doc && func(doc) === true)
              return true;

          } else if (findByIndex(query, value, func) === true)
            return true;
        }
      }

      function fromServer(model, id, changes) {
        const modelName = model.modelName;
        const docs = Model._getProp(model.dbId, modelName, 'simDocs');
        if (! docs) return changes;

        if (! changes) {
          return docs[id] = 'new';
        }
        const keys = docs[id];
        if (! keys) return changes;
        if (keys === 'new') {
          changes = util.deepCopy(changes);
          delete changes._id;
          const nc = {};
          const doc = model.docs[id];
          if (doc) for (let key in doc.attributes) {
            if (key === '_id') continue;
            if (! changes.hasOwnProperty(key))
              nc[key] = undefined;
          }
          if (util.isObjEmpty(nc))
            delete docs[id];
          else
          docs[id] = nc;

          return changes;
        }

        const nc = {};

        for (let key in changes) {
          if (key === '_id') continue;
          const _m = key.match(/^([^.]+)\./);
          const m = _m ? _m[1] : key;

          if (! keys.hasOwnProperty(m)) {
            nc[key] = changes[key];
          }
          util.applyChange(keys, key, changes);
        }

        return nc;
      }

      function recordChange(model, attrs, changes) {
        const docs = simDocsFor(model);
        const keys = docs[attrs._id] || (docs[attrs._id] = {});
        if (changes) {
          for (let key in changes) {
            const m = key.match(/^([^.]+)\./);
            if (m) key=m[1];
            if (! keys.hasOwnProperty(key))
              keys[key] = util.deepCopy(attrs[key]);
          }
        } else {
          // remove
          for (let key in attrs) {
            if (! (key === '_id' || keys.hasOwnProperty(key)))
              keys[key] = util.deepCopy(attrs[key]);
          }
        }
      }

      function recordItemChange(model, attrs, key) {
        const docs = simDocsFor(model);
        const keys = docs[attrs._id] || (docs[attrs._id] = {});
        const m = key.match(/^([^.]+)\./);
        if (m) key=m[1];
        if (! keys.hasOwnProperty(key))
          keys[key] = util.deepCopy(attrs[key]);
      }

      function newEmptyObj() {return {}}

      function simDocsFor(model) {
        return Model._getSetProp(model.dbId, model.modelName, 'simDocs', newEmptyObj);
      }

      function reset() {
        unload();

        syncOb = session.state.pending.onChange(
          pending => pending || Query.revertSimChanges());

        stateOb = session.state.onChange(ready => {
          if (ready) return;

          const dbs = Model._databases[dbBroker.dbId];
          if (! dbs) return;
          for (let name in dbs) {
            const model = Model[name];
            if (! model) continue;
            const docs = model.docs;
            const sd = dbs[name].simDocs = {};
            for (let id in docs) {
              sd[id] = 'new';
            }
          }
        });
      }

      function unload() {
        syncOb && syncOb.stop();
        stateOb && stateOb.stop();
      }

      const EXPRS = {
        $ne(param, obj) {
          const expected = obj.$ne;
          return doc => ! foundItem(doc[param], expected);
        },
        $nin(param, obj) {
          const expected = obj.$nin;
          return doc => ! foundItem(doc[param], expected);
        },
      };

      function exprToFunc(param, value) {
        if (value && typeof value === 'object') {
          for (var key in value) break;
          const expr = EXPRS[key];
          if (expr) return expr(param, value);
        }
        return value;
      }

      function sortFunc(params) {
        return (a, b) => {
          for (let key in params) {
            const aVal = a[key]; const bVal = b[key];
            if (aVal !== bVal) return  (aVal < bVal) ? -params[key]  : params[key];
          }
          return 0;
        };
      }
    };
  }

  exports = Constructor(session);
  exports.__init__ = Constructor;

  return exports;

});
