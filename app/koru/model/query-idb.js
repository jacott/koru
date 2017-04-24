define(function(require, exports, module) {
  const koru       = require('koru');
  const BusyQueue  = require('koru/busy-queue');
  const ModelMap   = require('koru/model/map');
  const Query      = require('koru/model/query');
  const TransQueue = require('koru/model/trans-queue');
  const util       = require('koru/util');

  const iDB = Symbol(), pendingUpdates = Symbol();
  const busyQueue = Symbol(), idleQueue = Symbol();

  let notMe;

  function whenIdle(db) {
    const iq = db[idleQueue];
    if (! iq) return;
    db[idleQueue] = null;
    iq.r && iq.r(db);
  }

  function whenBusy(db) {db[idleQueue] = makePQ()}

  class Index {
    constructor(queryIDB, modelName, name) {
      this._queryIDB = queryIDB;
      this._withIndex = () => queryIDB[iDB]
        .transaction(modelName).objectStore(modelName).index(name);
    }

    getAll(query, count) {
      return wrapRequest(this._queryIDB, () => this._withIndex().getAll(query, count));
    }

    count(query, count) {
      return wrapRequest(this._queryIDB, () => this._withIndex().count(query));
    }

    get(key) {
      return wrapRequest(this._queryIDB, () => this._withIndex().get(key));
    }

    cursor(query, direction, action) {
      this._withIndex().openCursor(query, direction)
        .onsuccess = ({target: {result}}) => {
          action(result);
        };
    }

    keyCursor(query, direction, action) {
      this._withIndex().openKeyCursor(query, direction)
        .onsuccess = ({target: {result}}) => {
          action(result);
        };
    }
  }

  class QueryIDB {
    constructor({name, version, upgrade}) {
      this[pendingUpdates] = this[idleQueue] = null;
      const bq = this[busyQueue] = new BusyQueue(this);
      bq.whenIdle = whenIdle;
      bq.whenBusy = whenBusy;
      const onerror = event => {
        error(this, event);
      };
      bq.queueAction(() => {
        const req = window.indexedDB.open(name, version);
        if (upgrade) req.onupgradeneeded = (event) => {
          this[iDB] = event.target.result;
          upgrade({
            db: this, oldVersion: event.oldVersion,
            event, transaction: event.target.transaction,
          });
        };
        req.onerror = onerror;
        req.onsuccess = event => {
          const idb = this[iDB] = event.target.result;
          idb.onerror = onerror;
          bq.nextAction();
        };
      });
    }

    static canIUse() {
      if (! window.IDBKeyRange)
        return false;

      return !! window.IDBKeyRange.bound('Lucy', 'Ronald', false, true).includes;
    }

    get objectStoreNames() {
      return this[iDB].objectStoreNames;
    }

    transaction(tables, mode, {oncomplete, onabort}={}) {
      const tx = this[iDB].transaction(tables, mode);
      if (oncomplete) tx.oncomplete = oncomplete;
      if (onabort) tx.onabort = onabort;
      return tx;
    }

    loadDoc(modelName, rec) {
      const model = ModelMap[modelName];
      const curr = model.docs[rec._id];
      if (curr && ! curr.$stopGap) return;
      const orig = notMe;
      try {
        if (curr) {
          curr.$stopGap = undefined;
          curr.$update(rec);
        } else {
          Query.insert(notMe = new model(rec));
        }
      } finally {
        notMe = orig;
      }
    }

    loadDocs(n, recs) {
      recs.forEach(rec => {this.loadDoc(n, rec)});
    }

    get(modelName, _id) {
      return wrapOSRequest(this, modelName, os => os.get(_id));
    }

    getAll(modelName, query) {
      return wrapOSRequest(this, modelName, os => os.getAll(query));
    }

    count(modelName, query) {
      return wrapOSRequest(this, modelName, os => os.count(query));
    }

    cursor(modelName, query, direction, action) {
      this[iDB].transaction(modelName).objectStore(modelName)
        .openCursor(query, direction)
        .onsuccess = ({target: {result}}) => {
          action(result);
        };
    }

    put(modelName, rec) {
      TransQueue.transaction(() => {
        const pu = getPendingUpdates(this);
        const pm = pu[modelName] || (pu[modelName] = {});
        pm[rec._id] = rec;
      });
    }

    delete(modelName, id) {
      TransQueue.transaction(() => {
        const pu = getPendingUpdates(this);
        const pm = pu[modelName] || (pu[modelName] = {});
        pm[id] = null;
      });
    }

    close() {
      this[iDB] && this[iDB].close();
    }

    catch(onRejected) {
      const iq = this[idleQueue];
      return iq ? iq.p.catch(onRejected) : Promise.resolve();
    }

    whenReady(onFulfilled, onRejected) {
      return new Promise((resolve, reject) => {
        const bq = this[busyQueue];
        bq.queueAction(() => {
          try {
            Promise.resolve(onFulfilled(this))
              .then(resolve, reject);
          } catch(ex) {
            reject(ex);
          } finally {
            bq.nextAction();
          }
        });
      });
    }

    createObjectStore(name) {
      return this[iDB].createObjectStore(name, {keyPath: '_id'});
    }

    deleteObjectStore(name) {
      this[iDB].deleteObjectStore(name, {keyPath: '_id'});
    }

    index(modelName, name) {
      return new Index(this, modelName, name);
    }

    queueChange(now, was) {
      const doc = (now != null ? now : was);
      if (doc === notMe || doc.$stopGap) return;
      TransQueue.transaction(() => {
        const name = doc.constructor.modelName;
        const pu = getPendingUpdates(this);
        const pm = pu[name] || (pu[name] = {});
        const attrs = doc.attributes;
        pm[attrs._id] = now && attrs;
      });
    }
  } module.exports = QueryIDB;

  function error(db, ex) {
    const iq = db[idleQueue];
    iq && iq.e(ex);
    db[idleQueue] = null;
    if (db.catchAll)
      db.catchAll(ex);
    else throw new Error((ex.target && ex.target.error) || ex);
  }

  function getPendingUpdates(db) {
    const pu = db[pendingUpdates];
    if (pu) return pu;
    let count = 2;
    const bq = db[busyQueue];
    bq.queueAction(whenReady); // ensure we have the console
    TransQueue.onSuccess(() => {
      if (count === 1)
        bq.queueAction(whenReady);
      else
        count = 1;
    });
    TransQueue.onAbort(() => {db[pendingUpdates] = null});
    function whenReady() {
      if (--count)
        bq.nextAction();
      else
        flushPendng(db);
    }
    return db[pendingUpdates] = {};
  }

  function flushPendng(db) {
    const pu = db[pendingUpdates];
    if (! pu) return;
    db[pendingUpdates] = null;
    const models = Object.keys(pu);
    const tran = db[iDB].transaction(models, 'readwrite');
    tran.onabort = ex => {
      error(db, ex);
      db[busyQueue].nextAction();
    };
    tran.oncomplete = () => {
      db[busyQueue].nextAction();
    };
    for(let model of models) {
      const docs = pu[model];
      const os = tran.objectStore(model);
      for (var _id in docs) {
        const doc = docs[_id];
        doc ? os.put(doc) : os.delete(_id);
      }
    }
  }

  function makePQ() {
    let r, e;
    const p = new Promise((_r, _e) => {r = _r; e = _e});
    return {p, r, e};
  }

  function wrapOSRequest(db, modelName, body) {
    return wrapRequest(db, () => {
      const os = db[iDB].transaction(modelName).objectStore(modelName);
      return body(os);
    });
  }

  function wrapRequest(db, body) {
    return new Promise((resolve, reject) => {
      const bq = db[busyQueue];
      bq.queueAction(() => {
        try {
          const req = body();
          req.onerror = event => {
            error(db, event);
            reject(event);
          };
          req.onsuccess = event => {
            resolve(event.target.result);
          };
        } catch(ex) {
          error(db, ex);
          reject(ex);
        } finally {
          bq.nextAction();
        }
      });
    });
  }
});
