define((require)=>{
  'use strict';

  const next$ = Symbol();

  class PromiseQueue {
    constructor() {
      this[next$] = Promise.resolve();
    }

    add(callback) {
      const last = this[next$];
      this[next$] = last.then(callback, callback);
    }

    async empty() {
      for(;;) {
        let last = this[next$];
        await last;
        if (last === this[next$]) return;
      }
    }
  }

  return PromiseQueue;
});
