define(function(require, exports, module) {
  const koru = require('koru');
  const util = require('koru/util');

  const {Fiber} = util;
  const TOSym = Symbol();

  class IdleCheck {
    constructor() {
      this._count = 0;
      this._waitIdle = null;
      this.fibers = new Map();
      this.onDec = null;
      this.maxTime = null;
    }

    get count() {return this._count;}

    waitIdle(func) {
      if (this._count === 0) func();
      else {
        if (! this._waitIdle)
          this._waitIdle = [func];
        else
          this._waitIdle.push(func);
      }
    }

    inc() {
      const fiber = Fiber.current;
      if (! fiber)
        throw new Error('IdleCheck used outside of fiber');
      if (this.fibers.get(fiber))
        throw new Error('IdleCheck.inc called twice on fiber');
      this.fibers.set(fiber, Date.now());
      this.maxTime && (fiber[TOSym] = koru.setTimeout(() => {
        const {appThread={}} = fiber;
        koru.error(`aborted; timed out. dbId: ${appThread.dbId}, userId: ${appThread.userId}`);
        fiber.reset();
      }, this.maxTime));
      return ++this._count;
    }

    dec() {
      const fiber = Fiber.current;
      const cto = fiber[TOSym];
      cto && koru.clearTimeout(cto);
      const start = this.fibers.get(fiber);
      if (! start)
        throw new Error('IdleCheck.dec called with no corresponding inc');
      this.fibers.delete(fiber);
      this.onDec && this.onDec(fiber, start);
      if (--this._count === 0 & this._waitIdle !== null) {
        var funcs = this._waitIdle;
        this._waitIdle = null;
        util.forEach(funcs, function (func) {func()});
      }
    }

    exitProcessWhenIdle({forceAfter=20*1000, abortTxAfter=10*1000}={}) {
      koru.setTimeout(shutdown, forceAfter);
      koru.setTimeout(() => {
        for (const [fiber] of this.fibers) {
          try {
            fiber.reset();
          } catch(ex) {
            console.log(util.extractError(ex));
          }
        }
      }, abortTxAfter);

      this.waitIdle(shutdown);

      function shutdown() {
        console.log('=> Shutdown');
        process.exit(0);
      }
    }
  }

  module.exports = IdleCheck;

  IdleCheck.singleton = new IdleCheck();
});
