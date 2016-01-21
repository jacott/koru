define(function(require, exports, module) {
  var util = require('koru/util');

  function nextFrame (obj) {
    obj = obj || {};

    var queue;
    var afHandle;

    util.extend(obj, {
      nextFrame: function (func) {
        if (! queue) {
          queue = [func];
          afHandle = window.requestAnimationFrame(run);
        } else {
          queue.push(func);
        }
      },

      flushNextFrame: function () {
        if (! afHandle) return;
        window.cancelAnimationFrame(afHandle);
        run();
      },

      cancelNextFrame: function () {
        if (! afHandle) return;
        window.cancelAnimationFrame(afHandle);
        queue = afHandle = null;
      },

      isPendingNextFrame: function () {
        return queue != null;
      },
    });

    function run() {
      var q = queue;
      queue = afHandle = null;
      util.forEach(q, execOne);
    }

    function execOne(func) {
      func();
    }

    return obj;
  };

  return nextFrame;
});
