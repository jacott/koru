define((require, exports, module) => {
  'use strict';
  const Changes         = require('koru/changes');
  const DocChange       = require('koru/model/doc-change');
  const Model           = require('koru/model/map');
  const TransQueue      = require('koru/model/trans-queue');
  const Random          = require('koru/random');
  const session         = require('koru/session/client-rpc');
  const dbBroker        = require('./db-broker');
  const koru            = require('../main');
  const util            = require('../util');

  const {stopGap$} = require('koru/symbols');

  const {hasOwn, deepEqual, createDictionary} = util;

  const trimResults = (limit, results) => {
    if (limit !== null && results.length > limit) results.length = limit;
  };

  const __init__ = (session) => (Query, condition, notifyAC$) => {
    module.onUnload(
      session.state.pending.onChange((pending) => {
        pending == 0 && Query.revertSimChanges();
      }).stop,
    );

    const simDocsFor = (model) => Model._getSetProp(model.dbId, model.modelName, 'simDocs', createDictionary);

    util.merge(Query, {
      simDocsFor,

      revertSimChanges() {
        return TransQueue.nonNested(() => {
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
            for (const id in docs) {
              const doc = modelDocs[id];
              let [revert, apply] = docs[id];
              if (apply !== undefined) {
                if (revert === 'del') {
                  revert = apply;
                } else if (typeof apply === 'object' && apply._id === undefined) {
                  Changes.merge(revert, apply);
                } else {
                  revert = apply;
                }
              }
              if (revert === 'del') {
                if (doc === undefined) {
                  Query[notifyAC$](delDc._set(new model({_id: id})));
                } else {
                  delete modelDocs[id];
                  notify(delDc._set(doc));
                }
              } else if (doc === undefined) {
                if (revert._id === undefined) revert._id = id;
                notify(addDc._set(modelDocs[id] = new model(revert)));
              } else {
                if (revert._id !== undefined) {
                  const attrs = doc.attributes;
                  for (const key in attrs) {
                    if (!hasOwn(revert, key)) {
                      revert[key] = null;
                    }
                  }
                }
                const undo = Changes.applyAll(doc.attributes, revert);
                let hasKeys;
                for (hasKeys in undo) break;
                changeDc._set(doc, undo);
                if (hasKeys === undefined) {
                  Query[notifyAC$](changeDc);
                } else {
                  notify(changeDc);
                }
              }
            }
          }
        });
      },

      insert(doc) {
        return TransQueue.nonNested(() => {
          const model = doc.constructor;
          if (session.state.pendingCount() != 0) {
            recordChange(model, doc._id, 'del');
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

      insertFromServer(model, attrs) {
        return TransQueue.nonNested(() => {
          const id = attrs._id;
          const doc = model.docs[id];
          if (session.state.pendingCount() != 0) {
            if (fromServer(model, id, attrs)) {
              if (doc !== undefined) doc[stopGap$] = undefined;
              return;
            }
          }

          if (doc !== undefined) {
            // already exists; convert to update
            doc[stopGap$] = undefined;
            const old = doc.attributes;
            for (const key in old) {
              if (attrs[key] === undefined) {
                attrs[key] = undefined;
              }
            }
            for (const key in attrs) {
              const ov = old[key];
              const nv = attrs[key];
              if (ov === nv || deepEqual(ov, nv)) {
                delete attrs[key];
              }
            }
            for (const _ in attrs) {
              model.serverQuery.onId(id).update(attrs);
              break;
            }
          } else {
            // insert doc
            notify(DocChange.add(model.docs[id] = new model(attrs), 'serverUpdate'));
          }
        });
      },

      notify(docChange) {
        notify(docChange);
      },
    });

    util.merge(Query.prototype, {
      get docs() {
        return this._docs || (this._docs = this.model.docs);
      },

      indexCompareFunction() {
        const {_index} = this;
        if (_index?.idx.compare === undefined) {
          throw new Error('No comparable index on this query');
        }
        return _index.idx.compare;
      },

      withIndex(idx, params, options = {}) {
        if (this._sort) throw new Error('withIndex may not be used with sort');
        this.where(params);
        const {filterTest} = idx;
        if (filterTest !== undefined) this.where((doc) => filterTest.matches(doc));
        this._index = {idx, params, options};
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

      isFromServer: '',

      fromServer(type = 'serverUpdate') {
        this.isFromServer = type;
        return this;
      },

      fetch() {
        const results = [];
        this.forEach((doc) => {
          results.push(doc);
        });
        return results;
      },

      fetchIds() {
        const results = [];
        this.forEach((doc) => {
          results.push(doc._id);
        });
        return results;
      },

      fetchOne() {
        let result;
        this.forEach((doc) => (result = doc, true));
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
            findMatching.call(this, (doc) => results.push(doc));
            results.sort(this.compare);
            trimResults(this._limit, results);
            results.some(func);
          } else {
            findMatching.call(this, func);
          }
        }
      },

      map(func) {
        const results = [];
        this.forEach((doc) => {
          results.push(func(doc));
        });
        return results;
      },

      count(max) {
        let count = 0;
        if (this.model === undefined) return 0;
        const docs = this.docs;
        this.forEach((doc) => ++count === max);
        return count;
      },

      exists() {
        if (this.singleId !== undefined) {
          return this.findOne(this.singleId) !== undefined;
        } else {
          return this.count(1) === 1;
        }
      },

      notExists() {
        if (this.singleId !== undefined) {
          return this.findOne(this.singleId) === undefined;
        } else {
          return this.count(1) === 0;
        }
      },

      findOne(id) {
        const doc = this.docs[id];
        return doc !== undefined && this.matches(doc, doc.attributes)
          ? (this._fields ? doc.attributes : doc)
          : undefined;
      },

      remove() {
        return TransQueue.nonNested(() => {
          let count = 0;

          dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
            const {model, docs} = this;
            const isPending = session.state.pendingCount() != 0;
            if (isPending && this.isFromServer !== '') {
              if (fromServer(model, this.singleId)) {
                return 0;
              }
            }
            const dc = DocChange.delete();
            if (this.isFromServer !== '') dc.flag = this.isFromServer;
            this.forEach((doc) => {
              ++count;
              Model._support.callBeforeObserver('beforeRemove', doc);
              if (isPending && this.isFromServer === '') {
                recordChange(model, doc._id, doc.attributes);
              }
              delete docs[doc._id];
              notify(dc._set(doc));
            });
          });
          return count;
        });
      },

      update(changesOrField = {}, value) {
        const origChanges = (typeof changesOrField === 'string') ? {[changesOrField]: value} : changesOrField;

        if (origChanges._id !== undefined) {
          delete origChanges._id;
        }

        const {model, docs, singleId} = this;
        this.isFromServer === '' &&
          Model._support._updateTimestamps(origChanges, model.updateTimestamps, util.newDate());

        return TransQueue.nonNested(() => {
          let count = 0;

          return dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
            const isPending = session.state.pendingCount() != 0;
            if (isPending && this.isFromServer !== '' && fromServer(model, this.singleId, origChanges)) {
              return 0;
            }

            const dc = DocChange.change();
            this.forEach((doc) => {
              ++count;
              const attrs = doc.attributes;

              if (this._incs !== undefined) {
                for (const field in this._incs) {
                  origChanges[field] = attrs[field] + this._incs[field];
                }
              }

              const undo = Changes.applyAll(attrs, origChanges);
              if (this.isFromServer !== '') {
                dc.flag = 'serverUpdate';
              } else if (isPending) {
                recordChange(model, attrs._id, undo);
              }
              for (const key in undo) {
                notify(dc._set(doc, undo));
                break;
              }
            });
            return count;
          });
        });
      },
    });

    Query.prototype[Symbol.iterator] = function* () {
      if (this.singleId !== undefined) {
        const doc = this.findOne(this.singleId);
        doc !== undefined && (yield doc);
      } else {
        if (this._sort !== undefined) {
          const results = [];
          findMatching.call(this, (doc) => results.push(doc));
          results.sort(this.compare);
          trimResults(this._limit, results);
          yield* results;
        } else {
          yield* g_findMatching(this);
        }
      }
    };

    function* g_findMatching(q) {
      let {_limit} = q || 0;
      if (q.model === undefined) return;

      if (q._index !== undefined) {
        const {idx, params, options} = q._index;
        const orig = dbBroker.dbId, thisDb = q._dbId || orig;
        let lu;
        if (orig === thisDb) {
          lu = idx.lookup(params, options);
        } else {
          dbBroker.dbId = thisDb;
          lu = idx.lookup(params, options);
          dbBroker.dbId = orig;
        }
        if (lu !== undefined) {
          yield* g_findByIndex(q, lu, options, {_limit});
        }
      } else {
        for (const id in q.docs) {
          const doc = q.findOne(id);
          if (doc !== undefined && ((yield doc) === true || --_limit == 0)) {
            break;
          }
        }
      }
    }

    function* g_findByIndex(query, idx, options, v) {
      if (typeof idx === 'string') {
        const doc = query.findOne(idx);
        return doc !== undefined && ((yield doc) === true || --v._limit == 0);
      } else if (idx[Symbol.iterator] !== undefined) {
        if (idx.cursor) idx = idx.cursor(options);
        for (const rec of idx) {
          if (rec !== undefined) {
            const doc = query.findOne(rec._id);
            if (doc !== undefined && ((yield doc) === true || --v._limit == 0)) {
              return true;
            }
          }
        }
      } else {
        for (const key in idx) {
          const value = idx[key];
          if (typeof value === 'string') {
            const doc = query.findOne(value);
            if (doc !== undefined && ((yield doc) === true || --v._limit == 0)) {
              return true;
            }
          } else if ((yield* g_findByIndex(query, value, options, v)) === true) {
            return true;
          }
        }
      }
      return false;
    }

    const notify = (docChange) => {
      docChange.doc.$clearCache();
      docChange.model._indexUpdate.notify(docChange); // first: update indexes
      docChange.flag === undefined && Model._support.callAfterLocalChange(docChange); // next:  changes originated here

      Query[notifyAC$](docChange); // notify anyChange
      docChange.model.notify(docChange); // last:  Notify everything else
    };

    function findMatching(func) {
      if (this.model === undefined) return;

      let _limit = this._sort !== undefined || this._limit == null ? 0 : this._limit;

      if (this._index !== undefined) {
        const {idx, params, options} = this._index;
        const orig = dbBroker.dbId, thisDb = this._dbId || orig;
        let lu;
        if (orig === thisDb) {
          lu = idx.lookup(params, options);
        } else {
          dbBroker.dbId = thisDb;
          lu = idx.lookup(params, options);
          dbBroker.dbId = orig;
        }

        lu !== undefined && findByIndex(this, lu, options, func, {_limit});
      } else {
        for (const id in this.docs) {
          const doc = this.findOne(id);
          if (doc === undefined) continue;
          if (func(doc) === true || --_limit == 0) {
            break;
          }
        }
      }
    }

    const findOneByIndex = (query, id, func, v) => {
      const doc = query.findOne(id);
      return doc !== undefined && (func(doc) === true || --v._limit == 0);
    };

    const findByIndex = (query, idx, options, func, v) => {
      if (typeof idx === 'string') {
        return findOneByIndex(query, idx, func, v);
      } else if (idx[Symbol.iterator] !== undefined) {
        if (idx.values !== undefined) idx = idx.values(options);
        for (const rec of idx) {
          if (rec !== undefined && findOneByIndex(query, rec._id, func, v)) {
            return true;
          }
        }
      } else {
        for (const key in idx) {
          const value = idx[key];
          if (typeof value === 'string') {
            const doc = query.findOne(value);
            if (doc !== undefined && (func(doc) === true || --v._limit == 0)) {
              return true;
            }
          } else if (findByIndex(query, value, options, func, v) === true) {
            return true;
          }
        }
      }
      return false;
    };

    const fromServer = (model, id, changes) => {
      const modelName = model.modelName;
      const docs = Model._getProp(model.dbId, modelName, 'simDocs');
      if (docs === undefined) return false;
      const keys = docs[id];
      if (keys === undefined) return false;

      if (changes === undefined) {
        keys[1] = 'del';
      } else if (keys[1] === undefined || keys[1] === 'del') {
        keys[1] = changes;
      } else {
        Changes.merge(keys[1], changes);
      }

      return true;
    };

    const recordChange = (model, id, undo) => {
      const docs = simDocsFor(model);
      const keys = docs[id];
      undo = util.deepCopy(undo);
      if (keys === undefined) {
        docs[id] = [undo, undefined];
      } else {
        const curr = keys[0];
        if (typeof curr !== 'string') {
          if (curr !== undefined && typeof undo !== 'string') {
            Changes.merge(undo, curr);
          }
          keys[0] = undo;
        }
      }
    };
  };

  const func = __init__(session);
  func.__init__ = __init__;

  return func;
});
