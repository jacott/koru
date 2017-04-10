define(function(require, exports, module) {
  const koru = require('koru');
  const util = require('koru/util');

  const {Fiber} = util;

  class IdleCheck {
    constructor() {
      this._count = 0;
      this._waitIdle = null;
      this.fibers = new Map();
      this.onDec = null;
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
      const current = Fiber.current;
      if (! current)
        throw new Error('IdleCheck used outside of fiber');
      if (this.fibers.get(current))
        throw new Error('IdleCheck used twice on fiber');
      this.fibers.set(current, Date.now());
      return ++this._count;
    }

    dec() {
      const current = Fiber.current;
      const start = this.fibers.get(current);
      if (! start)
        throw new Error('IdleCheck.dec called with no corresponding inc');
      this.fibers.delete(current);
      this.onDec && this.onDec(current, start);
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
            fiber.throwInto(new Error('abort; process exit'));
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
