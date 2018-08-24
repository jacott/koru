define((require, exports, module)=>{
  const koru            = require('koru');
  const Changes         = require('koru/changes');
  const dbBroker        = require('koru/model/db-broker');
  const ModelMap        = require('koru/model/map');
  const Query           = require('koru/model/query');
  const TransQueue      = require('koru/model/trans-queue');
  const {stopGap$}      = require('koru/symbols');
  const util            = require('koru/util');

  const iDB$ = Symbol(), ready$ = Symbol(), pendingUpdates$ = Symbol(),
        busyQueue$ = Symbol();

  const {simDocsFor} = Query;

  let notMe;

  class Index {
    constructor(queryIDB, modelName, name) {
      this._queryIDB = queryIDB;
      this._withIndex = () => queryIDB[iDB$]
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

  if (window.IDBIndex !== undefined) {
    if (window.IDBIndex.prototype.getAllKeys === undefined) {
      Index.prototype.getAllKeys = function (query, count) {
        return wrapRequest(this._queryIDB, () => this._withIndex().getAll(query, count))
          .then(ans => ans.map(rec => rec._id));
      };
    } else {
      Index.prototype.getAllKeys = function (query, count) {
        return wrapRequest(this._queryIDB, () => this._withIndex().getAllKeys(query, count));
      };
    }
  }

  class QueryIDB {
    constructor({name, version, upgrade, catchAll}) {
      this.name = name;
      this.dbId = dbBroker.dbId;
      this[pendingUpdates$] = null;
      this[ready$] = false;
      this.catchAll = catchAll;
      const bq = this[busyQueue$] = new Promise((resolve, reject) => {
        const req = window.indexedDB.open(name, version);

        if (upgrade !== undefined) req.onupgradeneeded = (event) => {
          this[iDB$] = event.target.result;
          upgrade({
            db: this, oldVersion: event.oldVersion,
            event, transaction: event.target.transaction,
          });
        };
        req.onerror = req.onblocked = event => {
          this[busyQueue$] = undefined;
          error(this, event, reject);
        };
        req.onsuccess = event => {
          if (bq === this[busyQueue$])
            this[busyQueue$] = null;
          const idb = this[iDB$] = event.target.result;
          this[ready$] = this[pendingUpdates$] === null;
          resolve();
        };
      });
    }

    static canIUse() {
      if (window.IDBKeyRange === undefined)
        return false;

      return window.IDBKeyRange.bound('Lucy', 'Ronald', false, true).includes !== undefined;
    }

    static deleteDatabase(name) {
      return new Promise((resolve, reject) => {
        const req = window.indexedDB.deleteDatabase(name);
        req.onsuccess = resolve;
        req.onerror = reject;
        req.onblocked = reject;
      });
    }

    get objectStoreNames() {
      return this[iDB$].objectStoreNames;
    }

    transaction(tables, mode, {oncomplete, onabort}={}) {
      const tx = this[iDB$].transaction(tables, mode);
      if (oncomplete !== undefined) tx.oncomplete = oncomplete;
      if (onabort !== undefined) tx.onabort = onabort;
      return tx;
    }

    loadDoc(modelName, rec) {
      const model = ModelMap[modelName];
      const curr = model.docs[rec._id];
      if (curr !== undefined && curr[stopGap$] !== true) return;
      const orig = notMe;
      try {
        if (curr !== undefined) curr[stopGap$] = undefined;

        const sim = rec.$sim;
        if (sim !== undefined) rec.$sim = undefined;

        if (typeof sim === 'object' && typeof sim._id === 'string') {
          if (curr) delete model.docs[rec._id];
          simDocsFor(model)[rec._id] = sim;
          if (curr !== undefined) Query.notify(null, notMe = curr, false);
          return;
        }

        if (sim === 'new') {
          simDocsFor(model)[rec._id] = 'new';
        } else if (sim !== undefined) {
          simDocsFor(model)[rec._id] = sim;
        }
        let undo = null;
        notMe = model.docs[rec._id] = curr !== undefined ? (
          undo = Changes.applyAll(curr.attributes, rec),
          curr
        ) : new model(rec);
        if (undo === null || ! util.isObjEmpty(undo))
          Query.notify(notMe, undo, sim === undefined);
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
      this[iDB$].transaction(modelName).objectStore(modelName)
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

    get isClosed() {return this[busyQueue$] === undefined}

    close() {
      this[busyQueue$] = undefined;
      this[iDB$] && this[iDB$].close();
    }

    get isReady() {return this[ready$]}

    whenReady(onFulfilled) {
      if (this.isClosed) return Promise.reject(new Error('DB closed'));
      if (this[busyQueue$] === null) {
        if (onFulfilled === undefined)
          return Promise.resolve();
        this[busyQueue$] = Promise.resolve();
      }

      const oldPromise = this[busyQueue$] = this[busyQueue$].then(onFulfilled).then(result => {
        if (oldPromise === this[busyQueue$])
          this[busyQueue$] = null;
        return result;
      }, ev => {
        if (oldPromise === this[busyQueue$])
          this[busyQueue$] = null;
        const ex = ev.currentTarget ? ev.currentTarget.error : ev;
        this.catchAll == null || this.catchAll(ex);
        throw ex;
      });

      return oldPromise;
    }

    createObjectStore(name) {
      return this[iDB$].createObjectStore(name, {keyPath: '_id'});
    }

    deleteObjectStore(name) {
      this[iDB$].deleteObjectStore(name, {keyPath: '_id'});
    }

    index(modelName, name) {
      return new Index(this, modelName, name);
    }

    promisify(body) {return runBody(this, body)}

    queueChange(now, was) {
      const doc = (now != null ? now : was);
      if (doc === notMe || doc[stopGap$] === true) return;
      TransQueue.transaction(() => {
        const name = doc.constructor.modelName;
        const pu = getPendingUpdates(this);
        const pm = pu[name] === undefined ? (pu[name] = {}) : pu[name];
        const attrs = doc.attributes;
        pm[attrs._id] = now == null ? null : attrs;
      });
    }
  }

  const error = (db, ev, reject) => {
    const ex = ev.currentTarget ? ev.currentTarget.error : ev;
    try {
      reject(ev);
    } finally {
      db.catchAll == null || db.catchAll(ex);
    }
  };

  const getPendingUpdates = db => {
    const pu = db[pendingUpdates$];
    if (pu !== null) return pu;
    db[ready$] = false;
    TransQueue.onAbort(() => {db[pendingUpdates$] = null; db[ready$] = true});
    TransQueue.onSuccess(() => {db.isClosed || db.whenReady(() => flushPending(db))});
    return db[pendingUpdates$] = {};
  };

  const flushPending = db => {
    return new Promise((resolve, reject)=>{
      const pu = db[pendingUpdates$];
      if (pu === null) return;
      db[pendingUpdates$] = null;
      const models = Object.keys(pu);
      const tran = db[iDB$].transaction(models, 'readwrite');
      tran.onerror = tran.onabort = (ev)=>{
        db[ready$] = db[pendingUpdates$] === null;
        reject(ev);
      };
      tran.oncomplete = ()=>{
        db[ready$] = db[pendingUpdates$] === null;
        resolve();
      };

      dbBroker.withDB(db.dbId, () => {
        for(const modelName of models) {
          const docs = pu[modelName];
          const simDocs = ModelMap._getProp(db.dbId, modelName, 'simDocs');
          const os = tran.objectStore(modelName);
          for (const _id in docs) {
            const doc = docs[_id];
            const sdoc = simDocs === undefined ? undefined : simDocs[_id];
            if (sdoc === undefined)
              doc !== null ? os.put(doc) : os.delete(_id);
            else {
              if (doc === null) {
                if (sdoc === 'new')
                  os.delete(_id);
                else
                  os.put({_id: _id, $sim: sdoc});
              } else {
                os.put(Object.assign({$sim: sdoc}, doc));
              }
            }
          }
        }
      });
    });
  };

  const wrapOSRequest = (db, modelName, body)=> wrapRequest(
    db, () => body(db[iDB$].transaction(modelName).objectStore(modelName)));

  const wrapRequest = (db, body)=> runBody(db, body);

  const runBody = (db, body)=> new Promise((resolve, reject) => {
    try {
      const req = body();
      req.onerror = event => {
        error(db, event, reject);
      };
      req.onsuccess = event => {
        resolve(event.target.result);
      };
    } catch(ex) {
      error(db, ex, reject);
      return;
    }
  });


  return QueryIDB;
});
