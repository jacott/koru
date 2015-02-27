var fs = require('fs');
var Future = requirejs.nodeRequire('fibers/future');
var vm = require('vm');

define(function(require, exports, module) {
  var util = require('koru/util');
  var koru = require('./main');
  var session = require('./session');
  var buildCmd = require('./test/build-cmd');

  koru.onunload(module, 'reload');

  session.remoteControl = remoteControl;

  remoteControl.engine = 'Server';

  function remoteControl(ws) {
    var session = this;
    var oldLogHandle = session.provide('L', logHandle);
    var oldTestHandle = session.provide('T', testHandle);

    koru._INTERCEPT = intercept;

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
      case 'I':
        switch(args[1]) {
        case 'cont':
          continueIntercept();
          break;
        case 'script':
          try {
            vm.createScript(args[2], '\ninput', true);
            console.log(util.inspect(interceptObj(args[2])));
          } catch(ex) {
            console.log(util.extractError(ex));
          }
          break;
        }
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

    var future, interceptObj;

    function intercept(obj) {
      interceptObj = obj;
      ws.send('I' + util.extractError(new Error("interrupt")));
      future = new Future;
      try {
        return future.wait();
      } finally {
        future = null;
      }
    }

    function continueIntercept(arg) {
      if (future) future.return(arg);
    }
  }
});
