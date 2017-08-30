define(function(require, exports, module) {
  const Changes    = require('koru/changes');
  const Model      = require('koru/model/map');
  const TransQueue = require('koru/model/trans-queue');
  const Random     = require('koru/random');
  const session    = require('koru/session/client-rpc');
  const koru       = require('../main');
  const util       = require('../util');
  const dbBroker   = require('./db-broker');

  const {private$} = require('koru/symbols');

  const newSimDocs = ()=>{
    const o = Object.create(null);
    o.temp = null;
    delete o.temp; // hint to optimizer
    return o;
  };

  const EMPTY_OBJ = {};

  function Constructor(session) {
    return function(Query, condition, notifyAC$) {
      const {exprToFunc} = Query[private$];
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
                  const undo = Changes.applyAll(doc.attributes, fields);
                  for(const _ in undo) {
                    notify(model, doc, newDoc ? null : undo, true);
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
                const undo = Changes.applyAll(doc.attributes, changes);
                for(const noop in undo) {
                  notify(model, doc, undo, true);
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

        withIndex(idx, params, options={}) {
          if (this._sort) throw new Error('withIndex may not be used with sort');
          const orig = dbBroker.dbId;
          dbBroker.dbId = this._dbId || orig;
          this.where(params);
          if (idx.filterTest) this.where(idx.filterTest);
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
          if (this.singleId !== undefined)
            return this.findOne(this.singleId) !== undefined;
          else
            return this.count(1) === 1;
        },

        findOne(id) {
          const doc = this.docs[id];
          return doc !== undefined && this.matches(doc, doc.attributes) ? doc : undefined;
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

        update(changesOrField={}, value) {
          const origChanges = (typeof changesOrField === 'string')
                  ? {[changesOrField]: value} : changesOrField;
          return TransQueue.transaction(() => {
            let count = 0;
            const {model, docs} = this;

            Model._support._updateTimestamps(origChanges, model.updateTimestamps, util.newDate());

            return dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
              if (session.state.pendingCount() && this.isFromServer) {
                const changes = fromServer(model, this.singleId, origChanges);
                const doc = docs[this.singleId];
                if (doc === undefined) return 0;
                const undo = Changes.applyAll(doc.attributes, changes);
                for(const noop in undo) {
                  notify(model, doc, undo, this.isFromServer);
                  break;
                }
                return 1;
              }
              this.forEach(doc => {
                ++count;
                const attrs = doc.attributes;

                if (this._incs !== undefined) for(const field in this._incs) {
                  origChanges[field] = attrs[field] + this._incs[field];
                }

                session.state.pendingCount() == 0 ||
                  recordChange(model, attrs, origChanges);

                const undo = Changes.applyAll(attrs, origChanges);
                for(const key in undo) {
                  notify(model, doc, undo, this.isFromServer);
                  break;
                }
              });
              return count;
            });
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
        const doc = model.docs[id];
        if (keys === 'new') {
          changes = util.deepCopy(changes);
          delete changes._id;
          const nc = {};
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
          if (key === '$partial') {
            const ncp = nc.$partial = {};
            const partial = changes.$partial;
            for(const key in partial) {
              const alreadyChanged = keys.hasOwnProperty(key);
              const undo = [];
              Changes.applyPartial(keys, key, partial[key], undo);
              if (alreadyChanged) {
                // This will override any other simulated partial change but otherwise the partial
                // change may not apply correctly
                nc[key] = keys[key];
              } else {
                ncp[key] = partial[key];
              }
            }
          } else {
            if (! keys.hasOwnProperty(key)) nc[key] = changes[key];

            Changes.applyOne(keys, key, changes);
          }
        }

        if (util.isObjEmpty(nc.$partial))
          delete nc.$partial;

        return nc;
      }

      function recordChange(model, attrs, changes) {
        const docs = simDocsFor(model);
        const keys = docs[attrs._id] || (docs[attrs._id] = {});
        if (changes !== undefined) {
          if (keys !== 'new') for (const key in changes) {
            if (key === '$partial') {
              for (const key in changes.$partial) {
                if (! (key in keys))
                  keys[key] = util.deepCopy(attrs[key]);
              }
            } else {
              if (! (key in keys))
                keys[key] = util.deepCopy(attrs[key]);
            }
          }
        } else {
          // remove
          for(const key in attrs) {
            if (keys[key] === undefined)
              keys[key] = util.deepCopy(attrs[key]);
          }
        }
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


      function sortFunc(sort) {
        const slen = sort.length;
        return (a, b) => {
          for(let i = 0; i < slen; ++i) {
            const key = sort[i];
            const dir = i+1 == slen || typeof sort[i+1] !== 'number' ? 1 : (++i, -1);
            const aVal = a[key]; const bVal = b[key];
            if (aVal !== bVal) return  (aVal < bVal) ? -dir : dir;
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
