const cp = require('child_process');

define((require) => {
  'use strict';
  const koru            = require('koru');

  const sUtil = {
    execFile: (cmd, ...args) => new Promise((resolve) => {
      const callback = args.length && typeof args[args.length - 1] === 'function'
            ? args.pop()
            : undefined;

      let options = args.length && args[args.length - 1];
      if (options !== null && typeof options === 'object') {
        args.pop();
      } else {
        options = {};
      }

      const proc = cp.execFile(cmd, args, options, (error, stdout, stderr) => {
        resolve({error, stdout, stderr});
      });

      callback !== undefined && callback(proc);
    }),

    system: async (cmd, ...args) => {
      const ans = await sUtil.execFile(cmd, ...args);
      if (ans.error) {
        koru.error(ans.stderr);
        const err = new Error(ans.error.message);
        Object.assign(err, ans.error);
        throw err;
      } else {
        return ans.stdout;
      }
    },

    sleep: (ms) => new Promise((resolve) => {setTimeout(resolve, ms)}),
  };

  return sUtil;
});
