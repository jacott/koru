var Future = requirejs.nodeRequire('fibers/future');
var spawn = require('child_process').spawn;

define({
  system: function (cmd, args, outFunc) {
    var code;
    var proc = spawn(cmd, args);

    outFunc && proc.stdout.on('data', outFunc);

    var future = new Future;
    proc.on('close', function (c) {
      code = c;
      future.return();
    });

    future.wait();
    return code;
  },

  sleep: function (ms) {
    var future = new Future;
    setTimeout(function() {
      future.return();
    }, ms);
    return future.wait();
  },
});
