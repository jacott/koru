const Future = requirejs.nodeRequire('fibers/future');
const cp = require('child_process');

define((require)=>{
  'use strict';
  const koru = require('koru');

  const sUtil = {
    execFile: (cmd, ...args)=>{
      const future = new Future;
      const callback = args.length && typeof args[args.length - 1] === 'function' &&
            args.pop();

      let options = args.length && args[args.length - 1];
      if (options && typeof options === 'object')
        args.pop();
      else
        options = {};

      const proc = cp.execFile(cmd, args, options, (error, stdout, stderr) => {
        future.return({error, stdout, stderr});
      });

      callback && callback(proc);

      return future.wait();
    },

    system: (cmd, ...args)=>{
      const ans = sUtil.execFile(cmd, ...args);
      if (ans.error) {
        koru.error(ans.stderr);
        throw ans.error;
      } else
        return ans.stdout;
    },

    sleep: ms =>{
      const future = new Future;
      setTimeout(()=>{future.return()}, ms);
      return future.wait();
    },
  };

  return sUtil;
});
