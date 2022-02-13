define(() => {
  'use strict';

  class Future {
    isResolved = false;
    constructor() {
      this.promise = new Promise((resolve, reject) => {
        this.resolve = (arg) => (this.isResolved = true, resolve(arg));
        this.reject = (arg) => (this.isResolved = true, reject(arg));
      });
    }
  }

  return Future;
});
