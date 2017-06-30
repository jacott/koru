define(function(require, exports, module) {
  const TH   = require('koru/test/main');
  const util = require('koru/util');

  class Transaction {
    constructor(db) {
      this.db = db;
      this.onabort = this.oncomplete = null;
      db._pending.push(() => {
        this.onabort = null;
        this.oncomplete && this.oncomplete();
      });
    }

    objectStore(name) {
      return this.db._store[name];
    }

    abort() {
      this.oncomplete = false;
      this.onabort && this.onabort();
    }
  }

  class Database {
    constructor(version) {
      this._pending = [];
      this._store = {};
    }
    get objectStoreNames() {
      return Object.keys(this._store);
    }

    createObjectStore(name, options) {

      if (options.keyPath !== '_id')
        throw new Error('MockIndexedDB only supports _id for keyPath');
      if (this._store[name])
        throw new Error("MockIndexedDB already has objectStore: "+ name);
      return this._store[name] = new ObjectStore(name, this);
    }

    deleteObjectStore(name) {
      delete this._store[name];
    }

    close() {}

    transaction() {
      const self = this;
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

    get primaryKey() {return this._data[this._position]._id}

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
      const {docs, db: {_pending}} = this.os;
      if (Array.isArray(self.keyPath) && ! Array.isArray(key))
        key = [key];
      return {
        set onsuccess(f) {
          const result = util.deepCopy(
            findDoc(docs, self.keyPath, key)
              .sort(self.compare)[0]);
          _pending.push(() => {f({target: {result}});});
        },
      };
    }

    getAll(query) {
      const self = this;
      const {docs, db: {_pending}} = this.os;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs)
                  .filter(k => ! query || query.includes(values(docs[k], self.keyPath)))
                  .map(k => util.deepCopy(docs[k]))
                  .sort(self.compare);
          _pending.push(() => {f({target: {result}});});
        },
      };
    }

    getAllKeys(query) {
      const self = this;
      const {docs, db: {_pending}} = this.os;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs)
                  .filter(k => ! query || query.includes(values(docs[k], self.keyPath)))
                  .map(k => docs[k])
                  .sort(self.compare)
                  .map(d => d._id);
          _pending.push(() => {f({target: {result}});});
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
      const {docs, db: {_pending}} = this.os;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs).reduce(
            (s, k) => s + (! query || query.includes(values(docs[k], self.keyPath)) ? 1 : 0), 0);
          _pending.push(() => {f({target: {result}});});
        },
      };
    }
  }

  function values(rec, keyPath) {
    return Array.isArray(keyPath) ? keyPath.map(f => rec[f]) : rec[keyPath];
  }

  function findDoc(docs, keyPath, key) {
    const matcher = Array.isArray(keyPath) ? (
      doc => key.every(
        (v, i) => doc[keyPath[i]] === v
      )) : doc => doc[keyPath] === key;
    const ans = [];
    for (let _id in docs) {
      const doc = docs[_id];
      matcher(doc) && ans.push(doc);
    }
    return ans;
  }

  function compareById({_id: a}, {_id: b}) {
    return a < b ? -1 : a === b ? 0 : 1;
  }

  class ObjectStore {
    constructor(name, db) {
      this.db = db;
      this.name = name;
      this.docs = {};
      this.indexes = {};
    }

    get(id) {
      const {docs, db: {_pending}} = this;
      return {
        set onsuccess(f) {
          const result = util.deepCopy(docs[id]);
          _pending.push(() => {f({target: {result}});});
        },
      };
    }

    getAll(query) {
      const {docs, db: {_pending}} = this;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs).sort()
                  .filter(k => ! query || query.includes(k))
                  .map(k => util.deepCopy(docs[k]));
          _pending.push(() => {f({target: {result}});});
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
      const {docs, db: {_pending}} = this;
      return {
        set onsuccess(f) {
          const result = Object.keys(docs).reduce(
            (s, k) => s + (! query || query.includes(k) ? 1 : 0), 0);
          _pending.push(() => {f({target: {result}});});
        },
      };
    }

    put(doc) {
      this.docs[doc._id] = util.deepCopy(doc);
      const {_pending} = this.db;
      return {
        set onsuccess(f) {
          const result = doc._id;
          _pending.push(() => {f({target: {result}});});
        },
      };
    }

    delete(_id) {
      delete this.docs[_id];
      const {_pending} = this.db;
      return {
        set onsuccess(f) {_pending.push(() => {f({target: {result: undefined}})})},
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
      this._pending = [];
    }

    open(name, newVersion) {
      const db = this._dbs[name] || (this._dbs[name] = new Database(name, 0));
      const pending = db._pending;
      const oldVersion = this._version;
      return {
        set onupgradeneeded(func) {
          if (oldVersion !== newVersion)
            pending.push(() => {
              func({oldVersion, newVersion, target: {result: db, transaction: db}});
            });
        },
        set onsuccess(func) {
          pending.push(() => {
            db._version = newVersion;
            func({target: {result: db}});
          });
        },
      };
    }

    deleteDatabase(name) {
      delete this._dbs[name];
      const pending = this._pending;
      return {
        set onsuccess(func) {
          pending.push(()=>{
            func({target: {result: null}});
          });
        }
      };
    }

    yield(timer) {
      if (timer === undefined)
        flushPending(this);
      else
        setTimeout(() => {flushPending(this)}, timer);
    }
  }

  function flushPending(idb) {
    const {_pending, _dbs} = idb;
    if (_pending.length != 0) {
      idb._pending = [];
      _pending.forEach(p => {p()});
    }

    for (let name in _dbs) {
      const db = _dbs[name];
      const pending = db._pending;
      if (pending.length == 0) continue;
      db._pending = [];
      pending.forEach(p => {p()});
    }
  }

  return MockIndexedDB;
});
