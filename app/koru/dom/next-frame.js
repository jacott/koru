define((require)=>{
  const util = require('koru/util');

  return (obj={})=>{
    let queue = null;
    let afHandle = 0;

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
        if (afHandle == 0) return;
        window.cancelAnimationFrame(afHandle);
        run();
      },

      cancelNextFrame() {
        if (afHandle == 0) return;
        window.cancelAnimationFrame(afHandle);
        queue = null;
        afHandle = 0;
      },

      isPendingNextFrame() {
        return queue != null;
      },
    });

    function run() {
      const q = queue;
      queue = null;
      afHandle = 0;
      util.forEach(q, execOne);
    }

    const execOne = func=>{func()};

    return obj;
  };
});
