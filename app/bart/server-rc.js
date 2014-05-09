var fs = require('fs');
var Fiber = require('fibers');

define([
  'module', 'bart/core', 'bart-test/build-cmd',
  'bart/fs-tools', 'bart/session-server'
], function (module, core, buildCmd,
             fst, session) {
  core.onunload(module, 'reload');

  session.remoteControl = remoteControl;

  function remoteControl(ws) {
    var session = this;
    session.testHandle = testHandle;
    session.logHandle = logHandle;


    ws.on('close', function() {
      session.testHandle = session.logHandle = null;
    });
    ws.on('message', function(data, flags) {
      var args = data.split('\t');
      console.log('DEBUG message rc args', args);
      switch(args[0]) {
      case 'T':
        Fiber(function () {
          buildCmd.runTests(session, args[1], args[2], function (mode) {
            var count = 0;
            if (mode !== 'none') {
              if (mode !== 'server') count = session.totalSessions;
              if (mode !== 'client') ++count;
            }
            console.log('DEBUG mode, count',mode, count);

            ws.send('X' + count);
          });
        }).run();
        break;
      }
    });

    remoteControl.testHandle = testHandle;
    remoteControl.logHandle = logHandle;

    function testHandle(engine, msg) {
      ws.send(msg[0] + engine + '\x00' + msg.slice(1));
    }

    function logHandle(engine, msg) {
      ws.send('L' + engine + '\x00' + msg);
    }
  }
});
