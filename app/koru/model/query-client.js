define((require, exports, module)=>{
  const Changes         = require('koru/changes');
  const Model           = require('koru/model/map');
  const DocChange       = require('koru/model/doc-change');
  const TransQueue      = require('koru/model/trans-queue');
  const Random          = require('koru/random');
  const session         = require('koru/session/client-rpc');
  const koru            = require('../main');
  const util            = require('../util');
  const dbBroker        = require('./db-broker');

  const {stopGap$} = require('koru/symbols');

  const {hasOwn, deepEqual, createDictionary} = util;

  const trimResults = (limit, results)=>{
    if (limit !== null && results.length > limit) results.length = limit;
  };

  const EMPTY_OBJ = {};

  const __init__ = session => (Query, condition, notifyAC$)=>{
    let syncOb, stateOb;
    const origWhere = Query.prototype.where;

    const unload = ()=>{
      syncOb != null && syncOb.stop();
      stateOb != null && stateOb.stop();
    };

    const reset = ()=>{
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
          const sd = dbs[name].simDocs = createDictionary();
          for(const id in docs) {
            sd[id] = 'new';
          }
        }
      });
    };


    const simDocsFor = model => Model._getSetProp(
      model.dbId, model.modelName, 'simDocs', createDictionary);

    util.merge(Query, {
      simDocsFor,

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
            dbs[modelName].simDocs = createDictionary();
            const delDc = DocChange.delete(null, 'simComplete'),
                  addDc = DocChange.add(null, 'simComplete'),
                  changeDc = DocChange.change(null, null, 'simComplete');
            for(const id in docs) {
              let doc = modelDocs[id];
              const fields = docs[id];
              if (fields === 'new') {
                if (modelDocs[id] !== undefined) {
                  delete modelDocs[id];
                  notify(delDc._set(doc));
                }
              } else {
                const newDoc = doc === undefined;
                if (newDoc)
                  doc = modelDocs[id] = new model({_id: id});
                const undo = Changes.applyAll(doc.attributes, fields);
                let hasKeys;
                for(hasKeys in undo) break;
                const dc = newDoc ? addDc : changeDc;
                dc._set(doc, undo);
                if (hasKeys === undefined) {
                  Query[notifyAC$](dc);
                } else {
                  notify(dc);
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
          notify(DocChange.add(doc));
          return doc._id;
        });
      },

      _insertAttrs(model, attrs) {
        if (attrs._id === undefined) attrs._id = Random.id();
        model.docs[attrs._id] = new model(attrs);
      },

      insertFromServer(model, id, attrs) {
        return TransQueue.transaction(() => {
          const doc = model.docs[id];
          if (session.state.pendingCount()) {
            const [changes, flag] = fromServer(model, id, attrs);
            if (doc !== undefined && changes !== attrs) { // found existing
              doc[stopGap$] = undefined;
              const undo = Changes.applyAll(doc.attributes, changes);
              const dc = DocChange.change(doc, undo, flag);
              for(const noop in undo) {
                notify(dc);
                return doc._id;
              }
              Query[notifyAC$](dc);
              return doc._id;
            }
          }

          // otherwise new doc
          if (doc !== undefined) {
            // already exists; convert to update
            doc[stopGap$] = undefined;
            const old = doc.attributes;
            for(const key in old) {
              if (attrs[key] === undefined)
                attrs[key] = undefined;
            }
            for(const key in attrs) {
              const ov = old[key];
              const nv = attrs[key];
              if (ov === nv || deepEqual(ov, nv))
                delete attrs[key];
            }
            for (const _ in attrs) {
              model.serverQuery.onId(id).update(attrs);
              break;
            }
          } else {
            // insert doc
            attrs._id = id;
            notify(DocChange.add(model.docs[id] = new model(attrs), 'serverUpdate'));
          }
        });
      },

      notify(docChange) {
        notify(docChange);
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
        const {filterTest} = idx;
        if (filterTest !== null) this.where(doc => filterTest.matches(doc));
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
            findMatching.call(this, doc => results.push(doc));
            results.sort(this.compare);
            trimResults(this._limit, results);
            results.some(func);

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
        return doc !== undefined && this.matches(doc, doc.attributes)
          ? (this._fields ? doc.attributes : doc) : undefined;
      },

      remove() {
        return TransQueue.transaction(() => {
          let count = 0;

          dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
            const {model, docs} = this;
            if (session.state.pendingCount() && this.isFromServer) {
              const sims = Model._getProp(model.dbId, model.modelName, 'simDocs');
              const simDoc = sims && sims[this.singleId];
              const [changes, flag] = fromServer(model, this.singleId);
              if (changes === null) {
                const doc = docs[this.singleId];
                if (doc !== undefined) {
                  delete docs[this.singleId];
                  notify(DocChange.delete(doc, flag));
                } else if (simDoc !== undefined) {
                  Query[notifyAC$](DocChange.delete(
                    new model(simDoc === 'new' ? {_id: this.singleId} : simDoc), flag));
                }
                return 1;
              }
            }
            const dc = DocChange.delete();
            if (this.isFromServer) dc.flag = 'serverUpdate';
            this.forEach(doc => {
              ++count;
              Model._support.callBeforeObserver('beforeRemove', doc);
              if (session.state.pendingCount() && ! this.isFromServer) {
                recordChange(model, doc.attributes);
              }
              delete docs[doc._id];
              notify(dc._set(doc));
            });
          });
          return count;
        });
      },

      update(changesOrField={}, value) {
        const origChanges = (typeof changesOrField === 'string')
              ? {[changesOrField]: value} : changesOrField;

        const {model, docs, singleId} = this;
        Model._support._updateTimestamps(origChanges, model.updateTimestamps, util.newDate());

        return TransQueue.transaction(() => {
          let count = 0;

          return dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
            if (session.state.pendingCount() && this.isFromServer) {
              const [changes, flag] = fromServer(model, this.singleId, origChanges);
              const doc = docs[singleId];
              if (doc === undefined) return 0;
              const undo = Changes.applyAll(doc.attributes, changes);
              const dc = DocChange.change(doc, undo, flag);
              for(const _ in undo) {
                notify(dc);
                return 1;
              }
              Query[notifyAC$](dc);
              return 1;
            }

            const dc = DocChange.change();
            this.forEach(doc => {
              ++count;
              const attrs = doc.attributes;

              if (this._incs !== undefined) for(const field in this._incs) {
                origChanges[field] = attrs[field] + this._incs[field];
              }

              session.state.pendingCount() == 0 ||
                recordChange(model, attrs, origChanges);

              const undo = Changes.applyAll(attrs, origChanges);
              if (this.isFromServer) dc.flag = 'serverUpdate';
              for(const key in undo) {
                notify(dc._set(doc, undo));
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
          findMatching.call(this, doc => results.push(doc));
          results.sort(this.compare);
          trimResults(this._limit, results);
          yield *results;

        } else
          yield *g_findMatching(this);
      }
    };

    function *g_findMatching(q) {
      let {_limit} = q || 0;
      if (q.model === undefined) return;

      if (q._index !== undefined) {
        yield *g_findByIndex(q, q._index.idx, q._index.options, {_limit});

      } else for(const id in q.docs) {
        const doc = q.findOne(id);
        if (doc !== undefined && ((yield doc) === true || --_limit == 0))
          break;
      }
    }

    function *g_findByIndex(query, idx, options, v) {
      if (typeof idx === 'string') {
        const doc = query.findOne(idx);
        return doc !== undefined && ((yield doc) === true || --v._limit == 0);

      } else if (idx[Symbol.iterator]) {
        if (idx.cursor) idx = idx.cursor(options);
        for (const {_id} of idx) {
          const doc = query.findOne(_id);
          if (doc !== undefined && ((yield doc) === true || --v._limit == 0))
            return true;
        }

      } else for(const key in idx) {
        const value = idx[key];
        if (typeof value === 'string') {
          const doc = query.findOne(value);
          if (doc !== undefined && ((yield doc) === true || --v._limit == 0))
            return true;

        } else if ((yield *g_findByIndex(query, value, options, v)) === true)
          return true;
      }
      return false;
    }

    const notify = (docChange)=>{
      docChange.model._indexUpdate.notify(docChange); // first: update indexes
      docChange.flag === undefined &&
        Model._support.callAfterLocalChange(docChange); // next:  changes originated here

      Query[notifyAC$](docChange); // notify anyChange
      docChange.model.notify(docChange); // last:  Notify everything else
    };

    function findMatching(func) {
      if (this.model === undefined) return;

      let _limit = this._sort !== undefined || this._limit == null ? 0 : this._limit;

      if (this._index !== undefined) {
        findByIndex(this, this._index.idx, this._index.options, func, {_limit});

      } else for(const id in this.docs) {
        const doc = this.findOne(id);
        if ((doc !== undefined && func(doc) === true) || --_limit == 0)
          break;
      }
    }

    const findOneByIndex = (query, id, func, v)=>{
      const doc = query.findOne(id);
      return doc !== undefined && (func(doc) === true || --v._limit == 0);
    };

    function findByIndex(query, idx, options, func, v) {
      if (typeof idx === 'string') {
        return findOneByIndex(query, idx, func, v);

      } else if (idx[Symbol.iterator]) {
        if (idx.cursor) idx = idx.cursor(options);
        for (const {_id} of idx) {
          if (findOneByIndex(query, _id, func, v))
            return true;
        }

      } else for(const key in idx) {
        const value = idx[key];
        if (typeof value === 'string') {
          const doc = query.findOne(value);
          if (doc !== undefined && (func(doc) === true || --v._limit == 0) )
            return true;

        } else if (findByIndex(query, value, options, func, v) === true)
          return true;
      }
      return false;
    }

    const fromServer = (model, id, changes)=>{
      const modelName = model.modelName;
      const docs = Model._getProp(model.dbId, modelName, 'simDocs');
      if (docs === undefined) return [changes, 'serverUpdate'];

      if (changes === undefined) {
        delete docs[id];
        return [null, 'simComplete'];
      }
      const keys = docs[id];
      if (keys === undefined) {
        return [changes, 'serverUpdate'];
      }
      const doc = model.docs[id];
      if (keys === 'new') {
        changes = util.deepCopy(changes);
        delete changes._id;
        const nc = {};
        if (doc !== undefined) for(const key in doc.attributes) {
          if (key === '_id') continue;
          if (! hasOwn(changes, key))
            nc[key] = undefined;
        }
        if (util.isObjEmpty(nc)) {
          delete docs[id];
          return [changes, 'simComplete'];
        } else {
          docs[id] = nc;
          return [changes, 'serverUpdate'];
        }
      }

      const nc = {};
      for(const key in changes) {
        if (key === '_id') continue;
        if (key === '$partial') {
          const ncp = nc.$partial = {};
          const partial = changes.$partial;
          for(const key in partial) {
            const alreadyChanged = hasOwn(keys, key);
            const undo = [];
            Changes.applyPartial(keys, key, partial[key], undo);
            if (alreadyChanged) {
              // This will override any other simulated partial change otherwise the partial
              // change may not apply correctly
              nc[key] = keys[key];
            } else {
              ncp[key] = partial[key];
            }
          }
        } else {
          if (! hasOwn(keys, key)) nc[key] = changes[key];

          Changes.applyOne(keys, key, changes);
        }
      }

      if (util.isObjEmpty(nc.$partial))
        delete nc.$partial;

      return [nc, 'serverUpdate'];
    };

    const recordChange = (model, attrs, changes)=>{
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
    };
  };

  exports = __init__(session);
  exports.__init__ = __init__;

  return exports;
});
