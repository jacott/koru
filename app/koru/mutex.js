const Fiber = requirejs.nodeRequire('fibers');

define((require)=>{
  const util            = require('koru/util');

  const head$ = Symbol(), tail$ = Symbol();

  class Mutex {
    constructor() {
      this[head$] = undefined;
      this[tail$] = undefined;
    }

    lock() {
      const current = Fiber.current, node = [current, undefined];

      if (this[head$] === undefined) {
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
      if (node === undefined)
        throw new Error("mutex not locked");

      const nh = this[head$] = node[1];

      if (nh === undefined) {
        this[tail$] = undefined;
      } else {
        nh[0].run();
      }
    }
  }

  return Mutex;
});
