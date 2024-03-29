define((require) => {
  'use strict';
  const util            = require('koru/util');

  const head$ = Symbol(), tail$ = Symbol();

  class Mutex {
    constructor() {
      this[head$] = void 0;
      this[tail$] = void 0;
    }

    get isLocked() {return this[head$] !== void 0}

    get isLockedByMe() {return this[head$]?.[2] === util.thread}

    lock() {
      if (this.isLockedByMe) {
        ++this[head$][3];
        return;
      }
      const node = [void 0, void 0, util.thread, 1];
      const p = new Promise((resolve, reject) => {node[0] = resolve});

      if (this[head$] === void 0) {
        this[head$] = this[tail$] = node;
        return;
      }

      this[tail$] = this[tail$][1] = node;
      return p;
    }

    unlock() {
      const node = this[head$];
      if (node === void 0) {
        throw new Error('mutex not locked');
      }
      if (--node[3] > 0) return;

      const nh = this[head$] = node[1];

      if (nh === void 0) {
        this[tail$] = void 0;
      } else {
        nh[0]();
      }
    }
  }

  return Mutex;
});
