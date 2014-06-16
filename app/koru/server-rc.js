var fs = require('fs');

define([
  'module', 'koru', 'koru/test/build-cmd',
  'koru/fs-tools', 'koru/session/base'
], function (module, koru, buildCmd,
             fst, session) {
  koru.onunload(module, 'reload');

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
        koru.Fiber(function () {
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
        koru.error(ex);
      }
    }

    function logHandle(msg) {
      try {
        ws.send('L' + this.engine + '\x00' + msg);
      } catch(ex) {
        koru.error(ex);
      }
    }
  }
});
