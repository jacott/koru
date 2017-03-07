define(function(require, exports, module) {
  const util  = require('koru/util');

  let execute = new Set();

  class MockPromise {
    constructor(body) {
      this._arg = this._state = null;
      this._pendingFirst = this._pendingLast = null;
      const resolve = (arg) => {
        _action(this, arg, 'resolved');
      };
      const reject = (arg) => {
        _action(this, arg, 'rejected');
      };
      body(resolve, reject);
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
      for(let i = 0; i < count; ++i) {
        promises[i].then(oneResolved(i), reject);
      }
      if (count === 0) resolve(promises);
      --count;
      return ans;

      function oneResolved(i) {
        return ans => {
          promises[i] = ans;
          --count < 0 && resolve(promises);
        };
      }
    }

    static _resolveOrReject() {
      let resolve, reject;
      const p = new Promise((res, rej) => {resolve = res; reject = rej});
      p._resolve = resolve; p._reject = reject;
      return p;
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
          for (let curr = p._pendingFirst; curr; curr = curr.next) {
            p._pendingFirst = curr.next;

            try {
              if (_state === 'resolved') {
                const {onFulfilled} = curr;
                __resolve(curr, onFulfilled ? onFulfilled(_arg) : _arg);
              } else {
                const {onRejected} = curr;
                __resolve(curr, onRejected ? onRejected(_arg) : _arg, 'reject');
              }
            } catch(ex) {
              curr.reject(ex);
            }
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
        onFulfilled: typeof onFulfilled === 'function' && onFulfilled,
        onRejected: typeof onRejected === 'function' && onRejected,
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

  function __resolve(entry, ans, method='resolve') {
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
        if (! entry) return;
        const _entry = entry;
        entry = null;
        _entry.reject(arg);
      };
      then.call(ans, resP, rejP);
    } else
      entry[method](ans);
  }

  function _action(p, arg, state, pending) {
    if (p._state)
      throw new Error("MockPromise already "+state);
    p._arg = arg;

    p._state = state;
    execute.add(p);
  }

  return MockPromise;
});
