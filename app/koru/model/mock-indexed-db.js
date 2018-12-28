define((require)=>{
  const TH              = require('koru/test/main');
  const util            = require('koru/util');

  const idField$ = Symbol();

  class Transaction {
    constructor(db) {
      this.db = db;
      this.onabort = this.oncomplete = null;
      db._addPending(() => {
        this.onabort = null;
        this.oncomplete == null || this.oncomplete();
      });
    }

    objectStore(name) {
      return this.db._store[name];
    }

    abort() {
      this.oncomplete = null;
      this.onabort && this.onabort();
    }
  }

  class Database {
    constructor(name, version, mockdb) {
      this._store = {};
      this._mockdb = mockdb;
    }

    _addPending(func) {
      this._mockdb._addPending(func);
    }

    get objectStoreNames() {
      return Object.keys(this._store);
    }

    createObjectStore(name, options) {
      if (typeof options.keyPath !== 'string')
        throw new Error('MockIndexedDB only supports strings for keyPath');
      if (this._store[name])
        throw new Error("MockIndexedDB already has objectStore: "+ name);
      return this._store[name] = new ObjectStore(name, this, options.keyPath);
    }

    deleteObjectStore(name) {
      delete this._store[name];
    }

    close() {}

    transaction() {
      return new Transaction(this);
    }
  }

  class Cursor {
    constructor(store, query, direction, onsuccess) {
      this.store = store;
      store.getAll(query).onsuccess = ({target: {result}}) => {
        this._data = result;
        if (direction === 'prev')
          this._data.reverse();
        this._position = -1;
        this._onsuccess = onsuccess;
        this.continue();
      };
    }

    continue() {
      this._onsuccess({target: {result: this._data.length > ++this._position ? this : null}});
    }

    get value() {return this._data[this._position]}

    get primaryKey() {return this._data[this._position][this.store[idField$]]}

    delete() {
      if (this._isKeyCursor) throw new Error(`can't delete with keycursor`);
      delete this.store.docs[this.primaryKey];
    }
  }

  class Index {
    constructor(os, name, keyPath, options) {
      this.os = os;
      this.name = name;
      this.keyPath = keyPath;
      this.options = options;
      this.docs = os.docs;
      this[idField$] = os[idField$];
      this.compare = Array.isArray(keyPath) ? (
        ar, br) => {
          const av = values(ar, keyPath), bv = values(br, keyPath);
          for(let i = 0; i < keyPath.length; ++i) {
            const a = av[i], b = bv[i];
            if (a != b) {
              return a < b ? -1 : 1;
            }
          }
          return compareById(ar, br);
        } : (ar, br) => {
          const {[keyPath]: a} = ar, {[keyPath]: b} = br;
          return a < b ? -1 : a === b ? compareById(ar, br) : 1;
        };
    }

    get(key) {
      const self = this;
      const {docs, db} = this.os;
      if (Array.isArray(self.keyPath) && ! Array.isArray(key))
        key = [key];
      return {
        set onsuccess(f) {
          const result = util.deepCopy(
            findDoc(docs, self.keyPath, key)
              .sort(self.compare)[0]);
          db._addPending(() => {f({target: {result}});});
        },
      };
    }

    getAll(query) {
      const self = this;
      const {docs, db} = this.os;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs)
                  .filter(k => ! query || query.includes(values(docs[k], self.keyPath)))
                  .map(k => util.deepCopy(docs[k]))
                  .sort(self.compare);
          db._addPending(() => {f({target: {result}});});
        },
      };
    }

    getAllKeys(query) {
      const self = this;
      const idField = this[idField$];
      const {docs, db} = this.os;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs)
                  .filter(k => ! query || query.includes(values(docs[k], self.keyPath)))
                  .map(k => docs[k])
                  .sort(self.compare)
                  .map(d => d[idField]);
          db._addPending(() => {f({target: {result}});});
        },
      };
    }

    openCursor(query, direction) {
      const self = this;
      return {
        set onsuccess(f) {
          new Cursor(self, query, direction, f);
        },
      };
    }

    openKeyCursor(query, direction) {
      const self = this;
      return {
        set onsuccess(f) {
          new Cursor(self, query, direction, f)._isKeyCursor = true;
        },
      };
    }

    count(query) {
      const self = this;
      const {docs, db} = this.os;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs).reduce(
            (s, k) => s + (! query || query.includes(values(docs[k], self.keyPath)) ? 1 : 0), 0);
          db._addPending(() => {f({target: {result}});});
        },
      };
    }
  }

  function values(rec, keyPath) {
    return Array.isArray(keyPath) ? keyPath.map(f => rec[f]) : (rec[keyPath] || '');
  }

  function findDoc(docs, keyPath, key) {
    const matcher = Array.isArray(keyPath) ? (
      doc => key.every(
        (v, i) => doc[keyPath[i]] === v
      )) : doc => doc[keyPath] === key;
    const ans = [];
    for (let id in docs) {
      const doc = docs[id];
      matcher(doc) && ans.push(doc);
    }
    return ans;
  }

  function compareById({_id: a}, {_id: b}) {
    return a < b ? -1 : a === b ? 0 : 1;
  }

  class ObjectStore {
    constructor(name, db, idField='_id') {
      this.db = db;
      this.name = name;
      this[idField$] = idField;
      this.docs = {};
      this.indexes = {};
    }

    get(id) {
      const {docs, db} = this;
      return {
        set onsuccess(f) {
          const result = util.deepCopy(docs[id]);
          db._addPending(() => {f({target: {result}});});
        },
      };
    }

    getAll(query) {
      const {docs, db} = this;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs).sort()
                  .filter(k => ! query || query.includes(k))
                  .map(k => util.deepCopy(docs[k]));
          db._addPending(() => {f({target: {result}});});
        },
      };
    }

    openCursor(query, direction) {
      const self = this;
      return {
        set onsuccess(f) {
          new Cursor(self, query, direction, f);
        },
      };
    }

    count(query) {
      const {docs, db} = this;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs).reduce(
            (s, k) => s + (! query || query.includes(k) ? 1 : 0), 0);
          db._addPending(() => {f({target: {result}});});
        },
      };
    }

    put(doc) {
      const idField = this[idField$];
      this.docs[doc[idField]] = util.deepCopy(doc);
      const {db} = this;
      return {
        set onsuccess(f) {
          const result = doc[idField];
          db._addPending(() => {f({target: {result}});});
        },
      };
    }

    delete(id) {
      delete this.docs[id];
      const {db} = this;
      return {
        set onsuccess(f) {db._addPending(() => {f({target: {result: undefined}})})},
      };
    }

    createIndex(name, keyPath, options) {
      if (this.indexes[name])
        throw new Error(this.name + " index already exists: "+name);

      return this.indexes[name] = new Index(this, name, keyPath, options);
    }

    index(name) {
      return this.indexes[name];
    }
  }

  class MockIndexedDB {
    constructor(version) {
      this._version = version;
      this.restore = TH.stubProperty(window, 'indexedDB', {value: this});
      this._dbs = {};
      this._pending = null;
    }

    open(name, newVersion) {
      const db = this._dbs[name] || (this._dbs[name] = new Database(name, 0, this));
      const oldVersion = this._version;
      return {
        result: db,
        set onupgradeneeded(func) {
          if (oldVersion !== newVersion)
            db._addPending(() => {
              func({oldVersion, newVersion, target: {result: db, transaction: db.transaction()}});
            });
        },
        set onsuccess(func) {
          db._addPending(() => {
            db._version = newVersion;
            func({target: {result: db}});
          });
        },
      };
    }

    _addPending(func) {
      if (this._pending === null) {
        this._pending = [func];
        this._scheduleRun();
      } else {
        this._pending.push(func);
      }
    }

    _scheduleRun() {
      Promise.resolve().then(() =>{
        this._run();
      });
    }

    _run() {
      const {_pending} = this;
      if (_pending !== null) {
        this._pending = null;
        for (const func of _pending) {
          func();
        }
      }
    }

    deleteDatabase(name) {
      const idb = this._dbs[name];
      if (idb === undefined) {
        return {};
      } else {
        delete this._dbs[name];
        return {
          set onsuccess(func) {
            idb._addPending(()=>{
              func({target: {result: null}});
            });
          }
        };
      }
    }
  }

  return MockIndexedDB;
});
