var fs = require('fs');

define([
  'module', 'koru/env', 'koru/test/build-cmd',
  'koru/fs-tools', 'koru/session/server-main'
], function (module, env, buildCmd,
             fst, session) {
  env.onunload(module, 'reload');

  session.remoteControl = remoteControl;

  remoteControl.engine = 'Server';

  function remoteControl(ws) {
    var session = this;
    var oldLogHandle = session.provide('L', logHandle);
    var oldTestHandle = session.provide('T', testHandle);

    // used by koru/test
    remoteControl.testHandle = testHandle;
    remoteControl.logHandle = logHandle;


    ws.on('close', function() {
      session.provide('L', oldLogHandle);
      session.provide('T', oldTestHandle);
    });
    ws.on('message', function(data, flags) {
      var args = data.split('\t');
      switch(args[0]) {
      case 'T':
        env.Fiber(function () {
          buildCmd.runTests(session, args[1], args[2], function (mode) {
            var count = 0;
            if (mode !== 'none') {
              if (mode !== 'server') count = session.totalSessions;
              if (mode !== 'client') ++count;
            }
            // FIXME send client agent

            ws.send('X' + count);
          });
        }).run();
        break;
      }
    });

    function testHandle(msg) {
      try {
        ws.send(msg[0] + this.engine + '\x00' + msg.slice(1));
      } catch(ex) {
        env.error(ex);
      }
    }

    function logHandle(msg) {
      try {
        ws.send('L' + this.engine + '\x00' + msg);
      } catch(ex) {
        env.error(ex);
      }
    }
  }
});
