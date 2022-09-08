define(() => {
  'use strict';

  const promise$ = Symbol();

  const reset = (fut) => {
    fut[promise$] = undefined;
    fut.reject = (value) => {
      const p = fut[promise$];
      if (p === undefined) {
        fut[promise$] = () => Promise.reject(value);
        fut.resolve = fut.reject = undefined;
      } else {
        fut.reject(value);
      }
    };

    fut.resolve = (value) => {
      const p = fut[promise$];
      if (p === undefined) {
        fut[promise$] = () => Promise.resolve(value);
        fut.resolve = fut.reject = undefined;
      } else {
        fut.resolve(value);
      }
    };
  };

  class Future {
    constructor() {reset(this)}

    get promise() {
      const p = this[promise$];
      if (p === undefined) {
        return this[promise$] = new Promise((resolve, reject) => {
          this.resolve = (arg) => {
            this.resolve = this.reject = undefined;
            resolve(arg);
          };
          this.reject = (arg) => {
            this.resolve = this.reject = undefined;
            reject(arg);
          };
        });
      } else if (typeof p === 'function') {
        return p();
      } else {
        return p;
      }
    }

    promiseAndReset() {return this.promise.finally((result) => (reset(this), result))}

    get isResolved() {return this.resolve === undefined}
  }

  return Future;
});
