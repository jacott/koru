define(function(require, exports, module) {
  var util = require('../util');

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

      flush: function () {
        if (! afHandle) return;
        window.cancelAnimationFrame(afHandle);
        run();
      },

      cancel: function () {
        if (! afHandle) return;
        window.cancelAnimationFrame(afHandle);
        queue = afHandle = null;
      },

      isEmpty: function () {
        return ! queue;
      },
    });

    function run() {
      var q = queue;
      queue = afHandle = null;
      q.forEach(execOne);
    }

    function execOne(func) {
      func();
    }

    return obj;
  };

  return nextFrame;
});
