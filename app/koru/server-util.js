var Future = requirejs.nodeRequire('fibers/future');
var spawn = require('child_process').spawn;

define({
  system: function (cmd, args, outFunc) {
    var code;
    var proc = spawn(cmd, args);

    switch(typeof outFunc) {
    case 'function':
      proc.stdout.on('data', outFunc);
      break;
    case 'object':
      if (outFunc !== null) {
        collectData(proc, outFunc, 'stdout');
        collectData(proc, outFunc, 'stderr');
        if (outFunc.stdin) {
          proc.stdin.write(outFunc.stdin);
        }
        proc.stdin.end();
      }
      break;
    }

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


function collectData(proc, out, stream) {
  out[stream] = '';
  proc[stream].on('data', function (data) {
    out[stream] += data.toString();
  });
}
