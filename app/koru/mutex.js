const Fiber = requirejs.nodeRequire('fibers');

define((require)=>{
  'use strict';
  const util            = require('koru/util');

  const head$ = Symbol(), tail$ = Symbol();

  class Mutex {
    constructor() {
      this[head$] = void 0;
      this[tail$] = void 0;
    }

    get isLocked() {return this[head$] !== void 0}

    lock() {
      const current = Fiber.current, node = [current, void 0];

      if (this[head$] === void 0) {
        this[head$] = this[tail$] = node;
        return;
      }

      this[tail$] = this[tail$][1] = node;
      Fiber.yield();
      while(this[head$][0] !== current)
        Fiber.yield();
    }

    unlock() {
      const {current} = Fiber, node = this[head$];
      if (node === void 0)
        throw new Error("mutex not locked");

      const nh = this[head$] = node[1];

      if (nh === void 0) {
        this[tail$] = void 0;
      } else {
        nh[0].run();
      }
    }
  }

  return Mutex;
});
