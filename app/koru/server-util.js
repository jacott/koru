const cp = require('child_process');

define((require) => {
  'use strict';
  const koru            = require('koru');
  const Future          = require('koru/future');

  const sUtil = {
    execFile: (cmd, ...args) => {
      const future = new Future();
      const callback = args.length && typeof args[args.length - 1] === 'function'
            ? args.pop()
            : void 0;

      let options = args.length && args[args.length - 1];
      if (options !== null && typeof options === 'object') {
        args.pop();
      } else {
        options = {};
      }

      const proc = cp.execFile(cmd, args, options, (error, stdout, stderr) => {
        future.resolve({error, stdout, stderr});
      });

      callback !== void 0 && callback(proc);

      return future.promise;
    },

    system: async (cmd, ...args) => {
      const ans = await sUtil.execFile(cmd, ...args);
      if (ans.error) {
        koru.error(ans.stderr);
        throw ans.error;
      } else {
        return ans.stdout;
      }
    },

    sleep: (ms) => {
      const future = new Future();
      setTimeout(future.resolve, ms);
      return future.promise;
    },
  };

  return sUtil;
});
