define((require) => {
  'use strict';
  const koru            = require('koru');
  const Changes         = require('koru/changes');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const Query           = require('koru/model/query');
  const TransQueue      = require('koru/model/trans-queue');
  const Observable      = require('koru/observable');
  const {stopGap$}      = require('koru/symbols');
  const util            = require('koru/util');

  const iDB$ = Symbol(), idle$ = Symbol(), pendingUpdates$ = Symbol(), busyQueue$ = Symbol();

  const {simDocsFor} = Query;

  let notMe;

  class Index {
    constructor(queryIDB, modelName, name) {
      this._queryIDB = queryIDB;
      this._withIndex = () =>
        queryIDB[iDB$].transaction(modelName).objectStore(modelName).index(name);
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
      this._withIndex().openCursor(query, direction).onsuccess = ({target: {result}}) => {
        action(result);
      };
    }

    keyCursor(query, direction, action) {
      this._withIndex().openKeyCursor(query, direction).onsuccess = ({target: {result}}) => {
        action(result);
      };
    }
  }

  if (window.IDBIndex !== undefined) {
    Index.prototype.getAllKeys = function (query, count) {
      return wrapRequest(this._queryIDB, () => this._withIndex().getAllKeys(query, count));
    };
  }

  const waitOnBusyQueue = (db) => {
    const op = db[busyQueue$];
    if (op == null) return Promise.resolve();
    return op.then(() => {
      if (op === db[busyQueue$]) {
        db[busyQueue$] = null;
      } else return waitOnBusyQueue(db);
    });
  };

  const dbClosedError = () => new Error('DB closed');

  const dbReady = (db) => {
    if (db[pendingUpdates$] === null) {
      const obs = db[idle$];
      if (obs !== null) {
        db[idle$] = null;
        obs.notify(db);
      }
    }
  };

  class QueryIDB {
    constructor({name, version, upgrade, catchAll}) {
      this.name = name;
      this.dbId = dbBroker.dbId;
      this[pendingUpdates$] = null;
      this[idle$] = new Observable();
      this.catchAll = catchAll;
      let resolve, reject;
      this[busyQueue$] = new Promise((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });
      const req = window.indexedDB.open(name, version);

      if (upgrade !== undefined) {
        req.onupgradeneeded = (event) => {
          this[iDB$] = event.target.result;
          upgrade({
            db: this,
            oldVersion: event.oldVersion,
            event,
            transaction: event.target.transaction,
          });
        };
      }
      req.onerror = req.onblocked = (event) => {
        this[busyQueue$] = undefined;
        error(this, event);
      };
      req.onsuccess = (event) => {
        const idb = this[iDB$] = event.target.result;
        if (!this.isClosed) this[busyQueue$] = null;
        dbReady(this);
        resolve();
      };
    }

    static canIUse() {
      if (window.IDBKeyRange === undefined) {
        return false;
      }

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

    transaction(tables, mode, {oncomplete, onabort} = {}) {
      const tx = this[iDB$].transaction(tables, mode);
      if (oncomplete !== undefined) tx.oncomplete = oncomplete;
      if (onabort !== undefined) tx.onabort = onabort;
      return tx;
    }

    loadDoc(modelName, rec) {
      const model = Model[modelName], id = rec._id;
      const curr = model.docs[id];
      if (curr !== undefined && curr[stopGap$] !== true) return;
      const orig = notMe;
      try {
        if (curr !== undefined) curr[stopGap$] = undefined;

        let sim = rec.$sim;
        if (sim !== undefined) {
          rec.$sim = undefined;
          if (!Array.isArray(sim)) { // port old style records
            sim = [sim === 'new' ? 'del' : sim, undefined];
          }
          simDocsFor(model)[id] = sim;
          const undo = sim[0];
          if (typeof undo === 'object' && undo._id === id) {
            if (curr !== undefined) {
              delete model.docs[id];
              Query.notify(DocChange.delete(notMe = curr));
            }
            return;
          }
        }
        let undo = null;
        notMe = model.docs[id] = curr !== undefined
          ? (undo = Changes.applyAll(curr.attributes, rec), curr)
          : new model(rec);
        if (undo === null || !util.isObjEmpty(undo)) {
          Query.notify(
            new DocChange(
              undo === null ? 'add' : 'chg',
              notMe,
              undo,
              sim === undefined ? 'idbLoad' : undefined,
            ),
          );
        }
      } finally {
        notMe = orig;
      }
    }

    loadDocs(n, recs) {
      recs.forEach((rec) => {
        this.loadDoc(n, rec);
      });
    }

    get(modelName, _id) {
      return wrapOSRequest(this, modelName, (os) => os.get(_id));
    }

    getAll(modelName, query) {
      return wrapOSRequest(this, modelName, (os) => os.getAll(query));
    }

    count(modelName, query) {
      return wrapOSRequest(this, modelName, (os) => os.count(query));
    }

    cursor(modelName, query, direction, action) {
      this[iDB$].transaction(modelName).objectStore(modelName).openCursor(query, direction)
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

    get isClosed() {
      return this[busyQueue$] === undefined;
    }

    close() {
      this[busyQueue$] = undefined;
      this[iDB$] && this[iDB$].close();
    }

    get isReady() {
      return this[busyQueue$] === null;
    }
    get isIdle() {
      return this[busyQueue$] === null && this[idle$] === null;
    }

    whenReady(noArgs) {
      if (noArgs !== undefined) throw new Error('Unexpected argument');
      if (this.isClosed) return Promise.reject(dbClosedError());

      return waitOnBusyQueue(this);
    }

    whenIdle() {
      return this.whenReady().then(() => {
        const obs = this[idle$];
        if (obs === null) return;
        return new Promise((resolve) => {
          obs.onChange(resolve);
        });
      });
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

    promisify(body) {
      return runBody(this, body);
    }

    queueChange(dc) {
      const {doc} = dc;
      if (doc === notMe || doc[stopGap$] === true) return;
      TransQueue.transaction(() => {
        const {_id, model: {modelName}, isDelete} = dc;
        const pu = getPendingUpdates(this);
        const pm = pu[modelName] || (pu[modelName] = {});
        pm[_id] = isDelete ? null : doc.attributes;
      });
    }
  }

  const error = (db, ev, reject) => {
    const ex = ev.currentTarget ? ev.currentTarget.error : ev;
    try {
      reject !== void 0 && reject(ev);
    } finally {
      db.catchAll == null || db.catchAll(ex);
    }
  };

  const getPendingUpdates = (db) => {
    const pu = db[pendingUpdates$];
    if (pu !== null) return pu;
    if (db[idle$] === null) db[idle$] = new Observable();
    TransQueue.onAbort(() => {
      db[pendingUpdates$] = null;
      dbReady(db);
    });
    TransQueue.onSuccess(() => {
      db.isClosed || waitOnBusyQueue(db).then(() => {
        flushPending(db);
      }).catch((err) => koru.unhandledException(err));
    });
    return db[pendingUpdates$] = {};
  };

  const flushPending = (db) => {
    const pu = db[pendingUpdates$];
    if (pu === null) return;
    db[pendingUpdates$] = null;

    const models = Object.keys(pu);
    const tran = db[iDB$].transaction(models, 'readwrite');

    tran.onerror = tran.onabort = (ev = new Error('IDB flush aborted')) => {
      dbReady(db);
      error(db, ev);
    };
    tran.oncomplete = () => {
      dbReady(db);
    };

    dbBroker.withDB(db.dbId, () => {
      for (const modelName of models) {
        const docs = pu[modelName];
        const simDocs = Model._getProp(db.dbId, modelName, 'simDocs');
        const os = tran.objectStore(modelName);
        for (const _id in docs) {
          const doc = docs[_id];
          const sdoc = simDocs === undefined ? undefined : simDocs[_id];
          if (sdoc === undefined) {
            doc !== null ? os.put(doc) : os.delete(_id);
          } else {
            if (doc === null) {
              if (sdoc[0] === 'del') {
                os.delete(_id);
              } else {
                os.put({_id: _id, $sim: sdoc});
              }
            } else {
              os.put(Object.assign({$sim: sdoc}, doc));
            }
          }
        }
      }
    });
  };

  const wrapOSRequest = (db, modelName, body) =>
    wrapRequest(db, () => body(db[iDB$].transaction(modelName).objectStore(modelName)));

  const wrapRequest = (db, body) => runBody(db, body);

  const runBody = (db, body) =>
    new Promise((resolve, reject) => {
      try {
        const req = body();
        req.onerror = (event) => {
          error(db, event, reject);
        };
        req.onsuccess = (event) => {
          resolve(event.target.result);
        };
      } catch (ex) {
        error(db, ex, reject);
        return;
      }
    });

  return QueryIDB;
});
