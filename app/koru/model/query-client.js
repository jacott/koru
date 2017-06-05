define(function(require, exports, module) {
  const Changes    = require('koru/changes');
  const Model      = require('koru/model/map');
  const TransQueue = require('koru/model/trans-queue');
  const Random     = require('koru/random');
  const session    = require('koru/session/client-rpc');
  const koru       = require('../main');
  const util       = require('../util');
  const dbBroker   = require('./db-broker');

  function newSimDocs() {
    const o = Object.create(null);
    o.temp = null;
    delete o.temp; // hint to optimizer
    return o;
  }

  function Constructor(session) {
    return function(Query, condition, notifyAC$) {
      let syncOb, stateOb;
      const origWhere = Query.prototype.where;

      util.merge(Query, {
        revertSimChanges() {
          return TransQueue.transaction(() => {
            const dbs = Model._databases && Model._databases[dbBroker.dbId];
            if (dbs === undefined) return;

            for (const modelName in dbs) {
              const model = Model[modelName];
              const modelDocs = model && model.docs;
              if (modelDocs === undefined) continue;
              const docs = dbs[modelName].simDocs;
              if (docs === undefined) continue;
              dbs[modelName].simDocs = newSimDocs();
              for(const id in docs) {
                let doc = modelDocs[id];
                const fields = docs[id];
                if (fields === 'new') {
                  if (modelDocs[id] !== undefined) {
                    delete modelDocs[id];

                    notify(model, null, doc, true);
                  }
                } else {
                  const newDoc = doc === undefined;
                  if (newDoc)
                    doc = modelDocs[id] = new model({_id: id});
                  Changes.applyAll(doc.attributes, fields);
                  for(const _ in fields) {
                    notify(model, doc, newDoc ? null : fields, true);
                    break;
                  }
                }
              }
            }
          });
        },

        insert(doc) {
          return TransQueue.transaction(() => {
            const model = doc.constructor;
            if (session.state.pendingCount() !== 0) {
              simDocsFor(model)[doc._id] = 'new';
            }
            model.docs[doc._id] = doc;
            notify(model, doc, null);
            return doc._id;
          });
        },

        _insertAttrs(model, attrs) {
          if (attrs._id === undefined) attrs._id = Random.id();
          model.docs[attrs._id] = new model(attrs);
        },

        insertFromServer(model, id, attrs) {
          return TransQueue.transaction(() => {
            if (session.state.pendingCount()) {
              const changes = fromServer(model, id, attrs);
              const doc = model.docs[id];
              if (doc !== undefined && changes !== attrs) { // found existing
                Changes.applyAll(doc.attributes, changes);
                for(const noop in changes) {
                  notify(model, doc, changes, true);
                  break;
                }
                return doc._id;
              }
            }

            // otherwise new doc
            if (model.docs[id] !== undefined) {
              // already exists; convert to update
              const old = model.docs[id].attributes;
              for(const key in old) {
                if (attrs[key] === undefined)
                  attrs[key] = undefined;
              }
              for(const key in attrs) {
                const ov = old[key];
                const nv = attrs[key];
                if (ov === nv || util.deepEqual(ov, nv))
                  delete attrs[key];
              }
              for (const _ in attrs) {
                model.serverQuery.onId(id).update(attrs);
                break;
              }
            } else {
              // insert doc
              attrs._id = id;
              const doc = new model(attrs);
              model.docs[doc._id] = doc;
              notify(model, doc, null, true);
            }
          });
        },

        notify(now, was, flag) {
          const doc = (now != null ? now : was);
          notify(doc.constructor, now, was, flag);
        },

        // for testing
        _reset: reset,

        _unload: unload,
      });

      reset();

      util.merge(Query.prototype, {
        get docs() {
          return this._docs || (this._docs = this.model.docs);
        },

        where(params, value) {
          const type = typeof params;
          if (type === 'function') {
            const funcs = this._whereFuncs || (this._whereFuncs = []);
            funcs.push(params);
            return this;
          } else {
            const wheres = this._wheres || (this._wheres = {});
            switch (type) {
            case 'string':
              value = exprToFunc(params, value);
              if (typeof value === 'function')
                return this.where(value);
              break;
            case 'object':
              for(const key in params) {
                this.where(key, params[key]);
              }
              return this;
            }
            return condition(this, '_wheres', params, value);
          }
        },

        withIndex(idx, params, options={}) {
          if (this._sort) throw new Error('withIndex may not be used with sort');
          const orig = dbBroker.dbId;
          dbBroker.dbId = this._dbId || orig;
          this._index = {idx: idx.lookup(params, options) || {}, options};

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
          if (this.singleId !== undefined) {
            const doc = this.findOne(this.singleId);
            doc !== undefined && func(doc);
          } else {
            if (this._sort !== undefined) {
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
          if (this.model === undefined) return 0;
          const docs = this.docs;
          this.forEach(doc => ++count === max);
          return count;
        },

        exists() {
          return this.count(1) === 1;
        },

        findOne(id) {
          const doc = this.docs[id];
          if (doc === undefined) return;
          const attrs = doc.attributes;

          if (this._whereNots !== undefined && foundIn(this._whereNots, false)) return;

          if (this._wheres !== undefined && ! foundIn(this._wheres)) return;

          if (this._whereFuncs !== undefined && this._whereFuncs.some(func => ! func(doc)))
            return;

          if (this._whereSomes !== undefined &&
              ! this._whereSomes.some(
                ors => ors.some(o => foundIn(o)))) return;

          return doc;

          function foundIn(fields, affirm=true) {
            for(const key in fields) {
              if (foundItem(attrs[key], fields[key]) !== affirm)
                return ! affirm;
            }
            return affirm;
          }
        },

        remove() {
          return TransQueue.transaction(() => {
            let count = 0;

            dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
              const {model, docs} = this;
              if (session.state.pendingCount() && this.isFromServer) {
                if (fromServer(model, this.singleId) === null) {
                  const doc = docs[this.singleId];
                  if (doc !== undefined) {
                    delete docs[this.singleId];
                    notify(model, null, doc, this.isFromServer);
                  }
                  return 1;
                }
              }
              this.forEach(doc => {
                ++count;
                Model._support.callBeforeObserver('beforeRemove', doc);
                if (session.state.pendingCount() && ! this.isFromServer) {
                  recordChange(model, doc.attributes);
                }
                delete docs[doc._id];
                notify(model, null, doc, this.isFromServer);
              });
            });
            return count;
          });
        },

        update(origChanges={}, value) {
          return TransQueue.transaction(() => {
            let count = 0;
            const {model, docs} = this;

            if (typeof origChanges === 'string') {
              const changes = {};
              changes[origChanges] = value;
              origChanges = changes;
            }
            Model._support._updateTimestamps(origChanges, model.updateTimestamps, util.newDate());

            if (session.state.pendingCount() && this.isFromServer) {
              const changes = fromServer(model, this.singleId, origChanges);
              const doc = docs[this.singleId];
              if (doc !== undefined) {
                Changes.applyAll(doc.attributes, changes);
                dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
                  for(const noop in changes) {
                    notify(model, doc, changes, this.isFromServer);
                    break;
                  }
                });
              }
              return 1;
            }
            dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
              this.forEach(doc => {
                const changes = util.deepCopy(origChanges);
                ++count;
                const attrs = doc.attributes;

                if (this._incs !== undefined) for(const field in this._incs) {
                  changes[field] = attrs[field] + this._incs[field];
                }

                session.state.pendingCount() && recordChange(model, attrs, changes);
                Changes.applyAll(attrs, changes);

                let itemCount = 0;
                {
                  const items = this._addItems;
                  if (items !== undefined) for(const field in items) {
                    const list = attrs[field] || (attrs[field] = []);
                    util.forEach(items[field], item => {
                      if (util.addItem(list, item) === undefined) {
                        session.state.pendingCount() && recordItemChange(model, attrs, field);
                        changes[field + ".$-" + ++itemCount] = item;
                      }
                    });
                  }
                }

                {
                  const items = this._removeItems;
                  if (items !== undefined) for(const field in items) {
                    const list = attrs[field];
                    let match;
                    util.forEach(items[field], item => {
                      if (list !== undefined && (match = util.removeItem(list, item)) !== undefined) {
                        session.state.pendingCount() && recordItemChange(model, attrs, field);
                        changes[field + ".$+" + ++itemCount] = match;
                      }
                    });
                  }
                }

                for(const key in changes) {
                  notify(model, doc, changes, this.isFromServer);
                  break;
                }
              });
            });
            return count;
          });
        },
      });

      Query.prototype[Symbol.iterator] = function *() {
        if (this.singleId !== undefined) {
          const doc = this.findOne(this.singleId);
          doc !== undefined && (yield doc);
        } else {
          if (this._sort !== undefined) {
            const results = [];
            const compare = sortFunc(this._sort);
            findMatching.call(this, doc => results.push(doc));
            yield *results.sort(compare);

          } else
            yield *g_findMatching(this);
        }
      };

      function *g_findMatching(q) {
        if (q.model === undefined) return;

        if (q._index !== undefined) {
          yield *g_findByIndex(q, q._index.idx, q._index.options);

        } else for(const id in q.docs) {
          const doc = q.findOne(id);
          if (doc !== undefined && (yield doc) === true)
            break;
        }
      }

      function *g_findByIndex(query, idx, options) {
        if (idx[Symbol.iterator]) {
          if (idx.cursor) idx = idx.cursor(options);
          for (const {_id} of idx) {
            const doc = query.findOne(_id);
            if (doc !== undefined && (yield doc) === true)
              return true;
          }

        } else for(const key in idx) {
          const value = idx[key];
          if (typeof value === 'string') {
            const doc = query.findOne(value);
            if (doc !== undefined && (yield doc) === true)
              return true;

          } else if ((yield *g_findByIndex(query, value, options)) === true)
            return true;
        }
        return false;
      }

      function foundItem(value, expected) {
        if (typeof expected === 'object') {
          if (Array.isArray(expected)) {
            const av = Array.isArray(value);
            for(let i = 0; i < expected.length; ++i) {
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
        model._indexUpdate.notify(doc, changes, isFromServer); // first: update indexes
        isFromServer ||
          Model._support.callAfterObserver(doc, changes); // next:  changes originated here
        Query[notifyAC$](doc, changes, isFromServer); // notify anyChange
        model.notify(doc, changes, isFromServer); // last:  Notify everything else
      }

      function findMatching(func) {
        if (this.model === undefined) return;

        if (this._index !== undefined) {
          findByIndex(this, this._index.idx, this._index.options, func);

        } else for(const id in this.docs) {
          const doc = this.findOne(id);
          if (doc !== undefined && func(doc) === true)
            break;
        }
      }

      function findByIndex(query, idx, options, func) {
        if (idx[Symbol.iterator]) {
          if (idx.cursor) idx = idx.cursor(options);
          for (const {_id} of idx) {
            const doc = query.findOne(_id);
            if (doc !== undefined && func(doc) === true)
              return true;
          }

        } else for(const key in idx) {
          const value = idx[key];
          if (typeof value === 'string') {
            const doc = query.findOne(value);
            if (doc !== undefined && func(doc) === true)
              return true;

          } else if (findByIndex(query, value, options, func) === true)
            return true;
        }
        return false;
      }

      function fromServer(model, id, changes) {
        const modelName = model.modelName;
        const docs = Model._getProp(model.dbId, modelName, 'simDocs');
        if (docs === undefined) return changes;

        if (changes === undefined) {
          delete docs[id];
          return null;
        }
        const keys = docs[id];
        if (keys === undefined) return changes;
        if (keys === 'new') {
          changes = util.deepCopy(changes);
          delete changes._id;
          const nc = {};
          const doc = model.docs[id];
          if (doc !== undefined) for(const key in doc.attributes) {
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

        for(const key in changes) {
          if (key === '_id') continue;
          const _m = key.match(/^([^.]+)\./);
          const m = _m ? _m[1] : key;

          if (! keys.hasOwnProperty(m)) {
            nc[key] = changes[key];
          }
          Changes.applyOne(keys, key, changes);
        }

        return nc;
      }

      function recordChange(model, attrs, changes) {
        const docs = simDocsFor(model);
        const keys = docs[attrs._id] || (docs[attrs._id] = {});
        if (changes !== undefined) {
          for(let key in changes) {
            const m = key.match(/^([^.]+)\./);
            if (m != null) key=m[1];
            if (! keys.hasOwnProperty(key))
              keys[key] = util.deepCopy(attrs[key]);
          }
        } else {
          // remove
          for(const key in attrs) {
            if (keys[key] === undefined)
              keys[key] = util.deepCopy(attrs[key]);
          }
        }
      }

      function recordItemChange(model, attrs, key) {
        const docs = simDocsFor(model);
        const keys = docs[attrs._id] || (docs[attrs._id] = {});
        const m = key.match(/^([^.]+)\./);
        if (m != null) key=m[1];
        if (! keys.hasOwnProperty(key))
          keys[key] = util.deepCopy(attrs[key]);
      }

      const newEmptyObj = () => Object.create(null);

      const simDocsFor = model => Model._getSetProp(
        model.dbId, model.modelName, 'simDocs', newEmptyObj);

      function reset() {
        unload();

        syncOb = session.state.pending.onChange(
          pending => pending || Query.revertSimChanges());

        stateOb = session.state.onChange(ready => {
          if (ready) return;

          const dbs = Model._databases[dbBroker.dbId];
          if (dbs === undefined) return;
          for(const name in dbs) {
            const model = Model[name];
            if (model === undefined) continue;
            const docs = model.docs;
            const sd = dbs[name].simDocs = {};
            for(const id in docs) {
              sd[id] = 'new';
            }
          }
        });
      }

      function unload() {
        syncOb != null && syncOb.stop();
        stateOb != null && stateOb.stop();
      }

      const EXPRS = {
        $ne(param, obj) {
          const expected = obj.$ne;
          return doc => ! foundItem(doc[param], expected);
        },
        $nin(param, obj) {
          const expected = new Set(obj.$nin);
          return doc => ! expected.has(doc[param]);
        },
        $in(param, obj) {
          return insertectFunc(param, obj.$in);
        },
      };

      function exprToFunc(param, value) {
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            return insertectFunc(param, value);
          }
          for (var key in value) break;
          const expr = EXPRS[key];
          if (typeof expr === 'function') return expr(param, value);
        }
        return value;
      }

      function sortFunc(params) {
        return (a, b) => {
          for(const key in params) {
            const aVal = a[key]; const bVal = b[key];
            if (aVal !== bVal) return  (aVal < bVal) ? -params[key]  : params[key];
          }
          return 0;
        };
      }

      function insertectFunc(param, list) {
        const expected = new Set(list);
        return doc => {
          const value = doc[param];
          return Array.isArray(value) ? value.some(value => expected.has(value)) :
            expected.has(value);
        };
      }
    };
  }

  exports = Constructor(session);
  exports.__init__ = Constructor;

  return exports;

});
