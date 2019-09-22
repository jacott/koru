define((require)=>{
  'use strict';
  const util            = require('koru/util');

  return (obj={})=>{
    let queue = null;
    let afHandle = 0;

    const execOne = func=>{func()};

    const run = ()=>{
      const q = queue;
      queue = null;
      afHandle = 0;
      q.forEach(execOne);
    };

    Object.assign(obj, {
      nextFrame: (func)=>{
        if (queue === null) {
          queue = [func];
          afHandle = window.requestAnimationFrame(run);
        } else {
          queue.push(func);
        }
      },

      flushNextFrame: ()=>{
        if (afHandle == 0) return;
        window.cancelAnimationFrame(afHandle);
        run();
      },

      cancelNextFrame: ()=>{
        if (afHandle == 0) return;
        window.cancelAnimationFrame(afHandle);
        queue = null;
        afHandle = 0;
      },

      isPendingNextFrame: ()=> queue !== null,
    });

    return obj;
  };
});
