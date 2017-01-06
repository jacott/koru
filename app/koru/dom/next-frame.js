define(function(require, exports, module) {
  const util = require('koru/util');

  function nextFrame (obj) {
    obj = obj || {};

    let queue;
    let afHandle;

    util.merge(obj, {
      nextFrame(func) {
        if (! queue) {
          queue = [func];
          afHandle = window.requestAnimationFrame(run);
        } else {
          queue.push(func);
        }
      },

      flushNextFrame() {
        if (! afHandle) return;
        window.cancelAnimationFrame(afHandle);
        run();
      },

      cancelNextFrame() {
        if (! afHandle) return;
        window.cancelAnimationFrame(afHandle);
        queue = afHandle = null;
      },

      isPendingNextFrame() {
        return queue != null;
      },
    });

    function run() {
      const q = queue;
      queue = afHandle = null;
      util.forEach(q, execOne);
    }

    function execOne(func) {func()}

    return obj;
  };

  return nextFrame;
});
