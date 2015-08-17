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

    var clients = {};
    for (var key in session.conns) {
      var conn = session.conns[key];
      clients[conn.engine] = [conn];
    }

    session.countNotify.onChange(function (conn, isOpen) {
      if (! conn.engine) return;
      var cs = clients[conn.engine];
      if (! cs) { cs = clients[conn.engine] = [conn]; }
      if (isOpen) {
        cs[0] = conn;
        if (testExec.client && testMode !== 'server') {
          if (cs[1]) {
            testExec.client(conn);
          } else if (testClientCount > testRunCount) {
            ++testRunCount;
            cs[1] = true;
            testExec.client(conn);
            ws.send('X'+conn.engine);
          }
        }
      } else {
        cs[0] = null;
      }
    });

    var testMode = 'none', testExec = {}, testClientCount = 0, testRunCount = 0;

    function testWhenReady() {
      if (testMode !== 'none') {
        if (testMode !== 'server' &&
            testExec.client && testClientCount > testRunCount) {
          for (var key in clients) {
            var cs = clients[key];
            if (cs[0]) {
              cs[1] = true;
              testExec.client(cs[0]);
              ws.send('X'+key);
              if (testClientCount === ++testRunCount)
                break;
            }
          }
        }
        if (testMode !== 'client' &&
            testExec.server && testClientCount === 0) {
          ws.send('XServer');
          testExec.server();
          testExec.server = null;
        }
      }
    }

    ws.on('close', function() {
      session.provide('L', oldLogHandle);
      session.provide('T', oldTestHandle);
    });
    ws.on('message', function(data, flags) {
      var args = data.split('\t');
      switch(args[0]) {
      case 'T':
        testClientCount = +args[3];
        koru.Fiber(function () {
          buildCmd.runTests(session, args[1], args[2], function (mode, exec) {
            testMode = mode;
            testExec = exec;
            if (mode === 'client')
              testExec.server = null;
            testWhenReady();
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
        if (msg[0] === 'F') {
          var cs = clients[this.engine];
          if (cs && cs[1]) {
            cs[1] = false;
            --testRunCount;
            if (--testClientCount === 0 && testExec.server) {
              testWhenReady();
              return;
            }
          }
          if (testClientCount || testExec.server) return;
          ws.send('Z');
        }
      } catch(ex) {
        koru.error(ex);
      }
    }

    function logHandle(msg) {
      try {
        this.engine !== 'Server' && console.log('INFO ' + this.engine + ' ' + msg);
        ws.send('L' + this.engine + '\x00' + msg);
      } catch(ex) {
        // ignore since it will just come back to us
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
