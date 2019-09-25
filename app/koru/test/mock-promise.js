define((require)=>{
  'use strict';
  const util            = require('koru/util');
  const TH              = require('koru/test');

  let execute = new Set();

  const OrigPromise = Promise;
  const top = globalThis;

  class MockPromise {
    constructor(body) {
      this._arg = undefined;
      this._state = null;
      this._pendingFirst = this._pendingLast = null;
      const resolve = (arg) => {
        _action(this, arg, 'resolved');
      };
      const reject = (arg) => {
        _action(this, arg, 'rejected');
      };
      body(resolve, reject);
    }

    static stubPromise() {
      top.Promise = MockPromise;
      TH.test.after(()=>{
        MockPromise.restore();
        MockPromise._stop();
      });
    }

    static restore() {
      top.Promise = OrigPromise;
    }

    static restoreForTest() {
      const current = top.Promise;
      MockPromise.restore();
      TH.test.after(()=>{top.Promise = current});
    }

    static resolve(value) {
      if (value instanceof MockPromise) return value;
      let resolve;
      const p = new MockPromise((r) => {resolve = r});
      resolve(value);
      return p;
    }

    static reject(value) {
      let reject;
      const p = new MockPromise((_, r) => {reject = r});
      reject(value);
      return p;
    }

    static all(promises) {
      let resolve, reject;
      const ans = new MockPromise((r, e) => {resolve = r; reject = e;});
      promises = Array.from(promises);
      let count = promises.length;

      const oneResolved = i => ans => {
        promises[i] = ans;
        --count < 0 && resolve(promises);
      };

      for(let i = 0; i < promises.length; ++i) {
        const p = promises[i];

        if (p && typeof p.then === 'function')
          p.then(oneResolved(i), reject);
        else
          --count;
      }

      if (count === 0) resolve(promises);
      --count;
      return ans;
    }

    static _resolveOrReject() {
      let resolve, reject;
      const p = new Promise((res, rej) => {resolve = res; reject = rej});
      p._resolve = resolve; p._reject = reject;
      return p;
    }

    static _pendingCount() {
      return execute.size;
    }

    static _poll() {
      let finished = false;
      while (! finished) {
        const curr = execute;
        execute = new Set();
        finished = true;
        for (let p of curr) {
          finished = false;

          const {_arg, _state} = p;
          if (_state === null) continue;
          let caught = _state === 'resolved';

          for (let curr = p._pendingFirst; curr; curr = curr.next) {
            if (p._pendingFirst === p._pendingLast)
              p._pendingLast = null;
            p._pendingFirst = curr.next;

            try {
              if (_state === 'resolved') {
                const {onFulfilled} = curr;
                __resolve(curr, onFulfilled ? onFulfilled(_arg) : _arg);
              } else {

                const {onRejected} = curr;
                if (onRejected !== null) {
                  caught = true;
                  try {
                    const ans = onRejected(_arg);
                    __resolve(curr, ans);
                  } catch(ex) {
                    __resolve(curr, ex, 'reject');
                  }
                } else {
                  caught = caught || !! curr.reject;
                  __resolve(curr, _arg, 'reject');
                }

              }
            } catch(ex) {
              if (! curr) throw ex;
              curr.reject(ex);
            }
          }
          if (! caught && _arg !== undefined) {
            if (_arg && _arg.message)
              _arg.message = `Uncaught MockPromise: ${_arg.message}`;

            throw (_arg instanceof Error) ? _arg : new Error('Uncaught rejected MockPromise');
          }
        }
      }
    }

    static _stop() {
      execute = new Set();
    }

    then(onFulfilled, onRejected) {
      const entry = {
        value: this._arg,
        onFulfilled: typeof onFulfilled === 'function' ? onFulfilled : null,
        onRejected: typeof onRejected === 'function' ? onRejected : null,
      };
      entry.p = new MockPromise((resolve, reject) => {
        entry.resolve = resolve; entry.reject = reject;
      });

      if (this._pendingLast)
        this._pendingLast.next = entry;
      else if (! this._pendingFirst)
        this._pendingFirst = entry;
      this._pendingLast = entry;

      this._state && execute.add(this);
      return entry.p;
    }

    catch(onRejected) {
      return this.then(null, onRejected);
    }
  }

  const __resolve = (entry, ans, method='resolve')=>{
    if (entry.p === ans) throw new TypeError("MockPromise cycle detected");
    const then = ans && ans.then;

    if (then) {
      const resP = arg => {
        if (! entry) return;
        const _entry = entry;
        entry = null;
        __resolve(_entry, arg);
      };
      const rejP = arg => {
        if (! entry) throw arg;
        const _entry = entry;
        entry = null;
        _entry.reject(arg);
      };
      then.call(ans, resP, rejP);
    } else
      entry[method](ans);
  };

  const _action = (p, arg, state)=>{
    if (p._state)
      throw new Error("MockPromise already "+state);
    p._arg = arg;

    p._state = state;
    execute.add(p);
  };

  return MockPromise;
});
