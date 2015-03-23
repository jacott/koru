define(function(require, exports, module) {
  var util = require('koru/util');


  function idleCheck() {
    var count = 0;
    var waitIdle = null;

    return {
      get count() {return count},
      waitIdle: function (func) {
        if (count === 0) func();
        else {
          if (! waitIdle)
            waitIdle = [func];
          else
            waitIdle.push(func);
        }
      },
      inc: function () {
        return ++count;
      },
      dec: function () {
        if (--count === 0 & waitIdle !== null) {
          var funcs = waitIdle;
          waitIdle = null;
          util.forEach(funcs, function (func) {func()});
        }
      },
    };
  }

  idleCheck.singleton = idleCheck();
  return idleCheck;
});
