define(['bart/core', 'module', 'bart/session-server'], function (core, module, session) {
  core.onunload(module, 'reload');

  session.remoteControl = remoteControl;
});

function remoteControl(ws) {
  var session = this;
  session.testHandle = testHandle;
  session.logHandle = logHandle;


  ws.on('close', function() {
    console.log('DEBUG close rc ');
  });
  ws.on('message', function(data, flags) {
    console.log('DEBUG message rc', data);
  });
  ws.send('X'+session.versionHash);

  function testHandle(engine, msg) {
    var m = /^FINISHED:(.*)$/.exec(msg);
    if (m) {
      ws.send('E' + engine + (m[1] === 'FAILED' ? ':1' : ':0'));
    } else {
      ws.send('R' + engine + ':' + msg);
    }
    console.log('testHandle', m, engine+':'+msg);
  }

  function logHandle(engine, msg) {
    ws.send('L' + engine + ':' + msg);
    console.log('logHandle', engine, msg);
  }
}
