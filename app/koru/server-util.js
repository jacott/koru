const Future = requirejs.nodeRequire('fibers/future');
const {execFile} = require('child_process');

define({
  system(cmd, ...args) {
    const future = new Future;
    const callback = args.length && typeof args[args.length - 1] === 'function' &&
            args.pop();

    let options = args.length && args[args.length - 1];
    if (options && typeof options === 'object')
      args.pop();
    else
      options = {};

    const proc = execFile(cmd, args, options, (error, stdout, stderr) => {
      future.return({error, stdout, stderr});
    });

    callback && callback(proc);

    return future.wait();
  },

  sleep(ms) {
    const future = new Future;
    setTimeout(function() {future.return()}, ms);
    return future.wait();
  },
});
