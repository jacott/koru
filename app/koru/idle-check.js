define(function(require, exports, module) {
  const util = require('koru/util');

  class IdleCheck {
    constructor() {
      this._count = 0;
      this._waitIdle = null;
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
      return ++this._count;
    }

    dec() {
      if (--this._count === 0 & this._waitIdle !== null) {
        var funcs = this._waitIdle;
        this._waitIdle = null;
        util.forEach(funcs, function (func) {func()});
      }
    }
  }

  module.exports = IdleCheck;

  IdleCheck.singleton = new IdleCheck();
});
