define(function(require, exports, module) {
  const TH   = require('koru/test/main');
  const util = require('koru/util');

  class MockIndexedDB {
    constructor(version) {
      this._version = version;
      this._pending = [];
      this._store = {};
      this.restore = TH.stubProperty(window, 'indexedDB', {value: this});
    }

    open(name, version) {
      const pending = this._pending;
      const oldVersion = this._version;
      const db = this;
      return {
        set onupgradeneeded(func) {
          if (oldVersion !== version)
            pending.push(() => {
              func({oldVersion, target: {result: db}});
            });
        },
        set onsuccess(func) {
          pending.push(() => {
            db._version = version;
            func({oldVersion, target: {result: db}});
          });
        },
      };
    }

    get objectStoreNames() {
      return Object.keys(this._store);
    }

    createObjectStore(name, options) {
      if (options.keyPath !== '_id') throw new Error('MockIndexedDB only supports _id for keyPath');
      this._store[name] = new ObjectStore(name, this);
    }

    transaction() {
      return this;
    }

    objectStore(name) {
      return this._store[name];
    }

    yield(timer) {
      if (timer === undefined)
        flushPending(this);
      else
        setTimeout(() => {flushPending(this)}, timer);
    }
  } module.exports = MockIndexedDB;

  class ObjectStore {
    constructor(name, db) {
      this.db = db;
      this.docs = {};
    }

    get(id) {
      const {docs, db: {_pending}} = this;
      return {
        set onsuccess(f) {
          _pending.push(() => {
            f({target: {result: docs[id]}});
          });
        },
      };
    }

    put(doc) {
      this.docs[doc._id] = doc;
      const {_pending} = this.db;
      return {
        set onsuccess(f) {_pending.push(f)},
      };
    }

    delete(_id) {
      delete this.docs[_id];
      const {_pending} = this.db;
      return {
        set onsuccess(f) {_pending.push(f)},
      };
    }
  }

  function flushPending(db) {
    const pending = db._pending;
    if (! pending.length) return;
    db._pending = [];
    pending.forEach(p => {p()});
  }
});
