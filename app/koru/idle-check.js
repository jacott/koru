define((require)=>{
  'use strict';
  const koru = require('koru');
  const util = require('koru/util');

  const {Fiber} = util;
  const timeout$ = Symbol();

  class IdleCheck {
    constructor() {
      this._count = 0;
      this._waitIdle = null;
      this.fibers = new Map();
      this.onDec = null;
      this.alertTime = this.maxTime = null;
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
      if (this.maxTime !== null || this.alertTime !== null) {
        let func = () => {
          const {appThread={}} = fiber;

          console.error(
            `${func === void 0 ? "ABORTED; timed out" : "long running"}. dbId: ${appThread.dbId}, userId: ${appThread.userId} `+
              (appThread.action || ''));
          if (func === void 0)
            fiber.reset();
          else {
            this.maxTime && (fiber[timeout$] = setTimeout(func, this.maxTime));
            func = void 0;
          }
        };
        fiber[timeout$] = setTimeout(func, this.alertTime || this.maxTime);
        if (this.alertTime === null) func = void 0;
      }
      return ++this._count;
    }

    dec() {
      const fiber = Fiber.current;
      const cto = fiber[timeout$];
      cto && clearTimeout(cto);
      const start = this.fibers.get(fiber);
      if (! start)
        throw new Error('IdleCheck.dec called with no corresponding inc');
      this.fibers.delete(fiber);
      this.onDec && this.onDec(fiber, start);
      if (--this._count === 0 & this._waitIdle !== null) {
        const funcs = this._waitIdle;
        this._waitIdle = null;
        util.forEach(funcs, func =>{func()});
      }
    }

    exitProcessWhenIdle({forceAfter=20*1000, abortTxAfter=10*1000}={}) {
      const shutdown = ()=>{
        console.log('=> Shutdown');
        process.exit(0);
      };
      setTimeout(shutdown, forceAfter);
      setTimeout(() => {
        for (const [fiber] of this.fibers) {
          try {
            fiber.reset();
          } catch(ex) {
            console.log(util.extractError(ex));
          }
        }
      }, abortTxAfter);

      this.waitIdle(shutdown);
    }
  }

  IdleCheck.singleton = new IdleCheck();

  return IdleCheck;
});
