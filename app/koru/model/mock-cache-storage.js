define((require)=>{
  'use strict';
  const BTree           = require('koru/btree');
  const util            = require('koru/util');

  const cacheCompare = (a, b)=>{
    if (a.url === b.url) return 0;
    return a.url < b.url ? -1 : 1;
  };


  class MockCache {
    constructor() {
      this._btree = new BTree(cacheCompare);
    }

    put(req, response) {
      const entry = {url: req.url, response};
      this._btree.add(entry);
      return Promise.resolve();
    }

    match(req) {
      const v = this._btree.find({url: req.url});
      return Promise.resolve(v && v.response);
    }

    delete(req) {
      const v = this._btree.delete({url: req.url});
      return Promise.resolve(!!v);
    }
  }

  class MockCacheStorage {
    constructor() {
      this._caches = {};
    }

    open(name) {
      return Promise.resolve(this._caches[name] || (this._caches[name] = new MockCache()));
    }

    match(req) {
      let ans;
      for (const name in this._caches) {
        ans = this._caches[name].match(req);
        if (ans !== undefined) break;
      }
      return Promise.resolve(ans);
    }

    keys() {
      return Promise.resolve(Object.keys(this._caches));
    }

    delete(name) {
      return Promise.resolve(
        this._caches[name] === undefined ? false : (
          delete this._caches[name], true
        ));
    }
  }

  return MockCacheStorage;
});
