define(function(require, exports, module) {
  const koru       = require('koru');
  const BusyQueue  = require('koru/busy-queue');
  const ModelMap   = require('koru/model/map');
  const Query      = require('koru/model/query');
  const TransQueue = require('koru/model/trans-queue');
  const util       = require('koru/util');

  const iDB = Symbol(), pendingUpdates = Symbol();
  const busyQueue = Symbol(), idleQueue = Symbol();
  const catchAll = Symbol();
  let notMe;

  function whenIdle(db) {
    const iq = db[idleQueue];
    if (! iq) return;
    db[idleQueue] = null;
    iq.r && iq.r(db);
  }

  function whenBusy(db) {db[idleQueue] = makePQ()}

  class QueryIDB {
    constructor({name, version, upgrade}) {
      this[pendingUpdates] = this[idleQueue] = null;
      this[catchAll] = Symbol();
      const bq = this[busyQueue] = new BusyQueue(this);
      bq.whenIdle = whenIdle;
      bq.whenBusy = whenBusy;
      bq.queueAction(() => {
        const req = window.indexedDB.open(name, version);
        if (upgrade) req.onupgradeneeded = (event) => {
          this[iDB] = event.target.result;
          upgrade({db: this, oldVersion: event.oldVersion});
        };
        req.onerror = event => {
          error(this, event);
        };
        req.onsuccess = event => {

          const idb = this[iDB] = event.target.result;
          bq.nextAction();
        };
      });
    }

    static canIUse() {
      return !! window.indexedDB;
    }

    get objectStoreNames() {
      return this[iDB].objectStoreNames;
    }

    loadDoc(modelName, rec) {
      const orig = notMe;
      try {
        Query.insert(notMe = new ModelMap[modelName](rec));
      } finally {
        notMe = orig;
      }
    }

    get(modelName, _id) {
      return wrapOSRequest(this, modelName, os => os.get(_id));
    }

    getAll(modelName) {
      return wrapOSRequest(this, modelName, os => os.getAll());
    }

    put(modelName, rec) {
      TransQueue.transaction(() => {
        const pu = getPendingUpdates(this);
        const pm = pu[modelName] || (pu[modelName] = {});
        pm[rec._id] = rec;
      });
    }

    close() {
      this[iDB] && this[iDB].close();
    }

    catchAll(onRejected) {
      return this[catchAll].p.catch(onRejected);
    }

    catch(onRejected) {
      const iq = this[idleQueue];
      return iq ? iq.p.catch(onRejected) : Promise.resolve();
    }

    whenReady(onFulfilled, onRejected) {
      const iq = this[idleQueue];
      return iq ? iq.p.then(onFulfilled, onRejected) : Promise.resolve(onFulfilled(this));
    }

    createObjectStore(name) {
      const os = this[iDB].createObjectStore(name, {keyPath: '_id'});
    }

    queueChange(now, was) {
      TransQueue.transaction(() => {
        const doc = (now || was);
        if (doc === notMe) return;
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
    db[busyQueue].clear();
    const ca = db[catchAll];
    db[catchAll] = makePQ();

    if (ca.e) ca.e(ex);
    else throw(ex);
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
    const reqs = [];
    for(let model of models) {
      const docs = pu[model];
      const os = tran.objectStore(model);
      for (var _id in docs) {
        const doc = docs[_id];
        reqs.push(promisifyReq(doc ? os.put(doc) : os.delete(_id)));
      }
    }
    Promise.all(reqs).then(() => {
      db[busyQueue].nextAction();
    }, ex => error(db, ex));
  }

  function makePQ() {
    let r, e;
    const p = new Promise((_r, _e) => {r = _r; e = _e});
    return {p, r, e};
  }

  function promisifyReq(req) {
    return new Promise((resolve, reject) => {
      req.onerror = reject;
      req.onsuccess = (event) => {
        resolve(event);
      };
    });
  }

  function wrapOSRequest(db, modelName, body) {
    return new Promise((resolve, reject) => {
      const bq = db[busyQueue];
      bq.queueAction(() => {
        bq.nextAction();
        try {
          const os = db[iDB].transaction(modelName).objectStore(modelName);
          const req = body(os);
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
        }
      });
    });
  }
});
