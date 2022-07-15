define(() => {
  'use strict';

  const makePromise = (future) => new Promise((resolve, reject) => {
    future.resolve = (arg) => (future.resolve = void 0, resolve(arg));
    future.reject = (arg) => (future.resolve = void 0, reject(arg));
  });

  class Future {
    constructor() {
      this.promise = makePromise(this);
    }

    promiseAndReset() {
      return this.promise.finally((result) => {
        this.promise = makePromise(this);
        return result;
      });
    }

    get isResolved() {return this.resolve === void 0}
  }

  return Future;
});
