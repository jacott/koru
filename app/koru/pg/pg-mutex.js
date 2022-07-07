define((require, exports, module) => {
  'use strict';

  const head$ = Symbol(), tail$ = Symbol();

  class PgMutex {
    constructor() {
      this[head$] = void 0;
      this[tail$] = void 0;
    }
    lock() {
      const node = [void 0, void 0];
      const p = new Promise((resolve) => {node[0] = resolve});

      if (this[head$] === void 0) {
        this[head$] = this[tail$] = node;
        return;
      }

      this[tail$] = this[tail$][1] = node;
      return p;
    }

    unlock(msg) {
      const nh = this[head$] = this[head$][1];

      if (nh === void 0) {
        this[tail$] = void 0;
      } else {
        nh[0](msg);
      }
    }
  }

  return PgMutex;
});
