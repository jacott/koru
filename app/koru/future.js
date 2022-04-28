define(() => {
  'use strict';

  const makePromise = (future) => new Promise((resolve, reject) => {
    future.isResolved = false;
    future.resolve = (arg) => (future.isResolved = true, resolve(arg));
    future.reject = (arg) => (future.isResolved = true, reject(arg));
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
  }

  return Future;
});
