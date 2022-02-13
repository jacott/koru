define((require) => {
  'use strict';
  const util            = require('koru/util');

  class IdleCheck {
    constructor() {
      this._count = 0;
      this._waitIdle = null;
      this.threads = new Map();
      this.onDec = null;
      this.alertTime = this.maxTime = null;
    }

    get count() {return this._count}
    get info() {return this.threads.get(util.thread)}

    waitIdle(func) {
      if (this._count === 0) {
        func();
      } else {
        if (! this._waitIdle) {
          this._waitIdle = [func];
        } else {
          this._waitIdle.push(func);
        }
      }
    }

    inc() {
      const {thread} = util;
      if (thread === void 0) {
        throw new Error('IdleCheck used outside of async thread');
      }
      if (this.threads.get(thread)) {
        throw new Error('IdleCheck.inc called twice on thread');
      }
      const info = {timeout: void 0, start: Date.now()};
      this.threads.set(thread, info);
      if (this.maxTime !== null || this.alertTime !== null) {
        let func = () => {
          console.error(
            `${func === void 0
            ? 'ABORTED; timed out'
            : 'long running'}. dbId: ${thread.dbId}, userId: ${thread.userId} ${thread.action ?? ''}`);
          if (func === void 0) {
            globalThis.__koruThreadLocal.enterWith(thread);
            this.abortThread('timeout');
          } else {
            if (this.maxTime !== null) info.timeout = setTimeout(func, this.maxTime);
            func = void 0;
          }
        };
        info.timeout = setTimeout(func, this.alertTime || this.maxTime);
        if (this.alertTime === null) func = void 0;
      }
      return ++this._count;
    }

    dec() {
      const {thread} = util;
      const info = this.threads.get(thread);
      --this._count;
      if (info === void 0) {
        throw new Error('IdleCheck.dec called with no corresponding inc');
      }
      const {timeout} = info;
      timeout !== void 0 && clearTimeout(timeout);
      this.threads.delete(thread);
      this.onDec?.(thread, info.start);
      if (this._count === 0 & this._waitIdle !== null) {
        const funcs = this._waitIdle;
        this._waitIdle = null;
        for (const func of funcs) func();
      }
    }

    abortThread(err) {
      const {__koruThreadLocal: tl} = globalThis;
      const {info} = this;
      if (info === void 0) return false;
      info.abort?.(err);
      return true;
    }

    exitProcessWhenIdle({forceAfter=20*1000, abortTxAfter=10*1000}={}) {
      const shutdown = () => {
        console.log('=> Shutdown');
        process.exit(0);
      };
      setTimeout(shutdown, forceAfter);
      setTimeout(() => {
        const timedOut = new Error('Aborted');
        const {__koruThreadLocal: tl} = globalThis;
        for (const thread of this.threads.keys()) {
          tl.enterWith(thread);
          this.abortThread(timedOut);
        }
      }, abortTxAfter);

      this.waitIdle(shutdown);
    }
  }

  IdleCheck.singleton = new IdleCheck();

  return IdleCheck;
});
