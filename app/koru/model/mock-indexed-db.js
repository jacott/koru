define(function(require, exports, module) {
  const TH   = require('koru/test/main');
  const util = require('koru/util');

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

    close() {}

    transaction() {
      return this;
    }

    objectStore(name) {
      return this._store[name];
    }
  }

  class Index {
    constructor(os, name, keypath, options) {
      this.os = os;
      this.name = name;
      this.keypath = keypath;
      this.options = options;
    }

    get(id) {
      const self = this;
      const {docs, db: {_pending}} = this.os;
      return {
        set onsuccess(f) {
          const result = util.deepCopy(
            findDoc(docs, doc => self.compare(doc, {[self.keypath]: id}) === 0)
              .sort((a, b) => self.compare(a, b) || compareById(a, b))[0]);
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
                  .map(k => util.deepCopy(docs[k]))
                  .filter(d => ! query || query.includes(d[self.keypath]))
                  .sort((a, b) => self.compare(a, b) || compareById(a, b));
          _pending.push(() => {f({target: {result}});});
        },
      };
    }

    compare({[this.keypath]: a}, {[this.keypath]: b}) {
      return a < b ? -1 : a === b ? 0 : 1;
    }
  }

  function findDoc(docs, match) {
    const ans = [];
    for (let _id in docs) {
      const doc = docs[_id];
      match(doc) && ans.push(doc);
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


    yield(timer) {
      if (timer === undefined)
        flushPending(this);
      else
        setTimeout(() => {flushPending(this)}, timer);
    }
  }

  function flushPending({_dbs}) {
    for (let name in _dbs) {
      const db = _dbs[name];
      const pending = db._pending;
      if (! pending.length) continue;
      db._pending = [];
      pending.forEach(p => {p()});
    }
  }

  return MockIndexedDB;
});
