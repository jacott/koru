define((require, exports, module) => {
  'use strict';

  const locks$ = Symbol(), promise$ = Symbol();

  class ObjectLock {
    #conn = undefined;
    #db = undefined;
    #resolve = undefined;

    constructor(db, conn) {
      this.#db = db;
      this.#conn = conn;
      this[promise$] = new Promise((r) => {
        this.#resolve = r;
      });
    }

    unlock() {
      if (this.#conn !== undefined) {
        this.#db[locks$].delete(this.#conn);
        this.#conn = null;
        this.#resolve();
      }
    }
  }

  class MutexObjectMap {
    constructor() {
      this[locks$] = new Map();
    }
    async lock(conn) {
      let lock;
      while ((lock = this[locks$].get(conn)) !== undefined) {
        await lock[promise$];
      }
      lock = new ObjectLock(this, conn);
      this[locks$].set(conn, lock);
      return lock;
    }
  }

  return MutexObjectMap;
});
