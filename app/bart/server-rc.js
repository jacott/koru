var fs = require('fs');

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
      console.log('DEBUG close rc ');
    });
    ws.on('message', function(data, flags) {
      var args = data.split('\t');
      console.log('DEBUG message rc args', args);
      switch(args[0]) {
      case 'T':
        session.unload('client-cmd');
        buildCmd.oneClient(args[2]);
        session.load('client-cmd');
        break;
      }
    });
    ws.send('X'+session.versionHash);

    function testHandle(engine, msg) {
      ws.send(msg[0] + engine + '\x00' + msg.slice(1));
    }

    function logHandle(engine, msg) {
      ws.send('L' + engine + '\x00' + msg);
    }
  }
});
