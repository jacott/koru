/*global require, define */

var fs = require('fs');
var Fiber = require('fibers');

define([
  'module', 'bart/core', 'bart-test/build-cmd',
  'bart/fs-tools', 'bart/session-server'
], function (module, core, buildCmd,
             fst, session) {
  core.onunload(module, 'reload');

  session.remoteControl = remoteControl;

  remoteControl.engine = 'Server';

  function remoteControl(ws) {
    var session = this;
    var oldLogHandle = session.provide('L', logHandle);
    var oldTestHandle = session.provide('T', testHandle);

    // used by bart-test
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
        Fiber(function () {
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
      ws.send(msg[0] + this.engine + '\x00' + msg.slice(1));
    }

    function logHandle(msg) {
      ws.send('L' + this.engine + '\x00' + msg);
    }
  }
});
