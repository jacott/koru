define((require)=>{
  const util            = require('koru/util');

  const {Future} = util;

  const future$ = Symbol(), locked$ = Symbol();

  class Mutex {
    constructor() {
      this[locked$] = 0;
      this[future$] = undefined;
    }

    lock() {
      if (++this[locked$] === 1) return;

      (this[future$] || (this[future$] = new util.Future)).wait();
    }

    unlock() {
      const counter = --this[locked$];
      if (counter == 0) return;

      if (counter < 0) throw new Error("mutex unlocked too many times");

      const future = this[future$];
      if (future !== undefined) {
        this[future$] = undefined;
        future.return();
      }
    }
  }

  return Mutex;
});
