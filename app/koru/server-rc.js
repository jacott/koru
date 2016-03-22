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
    var testMode = 'none', testExec = {};
    var testClientCount = 0, pendingClientTests = [];

    koru._INTERCEPT = intercept;

    // used by koru/test
    remoteControl.testHandle = testHandle;
    remoteControl.logHandle = logHandle;

    var clientCount = 0;
    var clients = {};
    for (var key in session.conns) {
      var conn = session.conns[key];
      var cs = clients[conn.engine];
      if (! cs) cs = clients[conn.engine] = {};
      cs[key] = newConn(conn);
    }

    ws.send('AServer');

    function channelKey(conn) {
      var engine = conn.engine;
      if (engine === 'Server')
        return engine;
      else
        return engine+' '+conn.sessId;
    }

    function newConn(conn) {
      var key = channelKey(conn);
      ws.send('A'+key);
      ++clientCount;
      return {conn: conn, key: key};
    }

    session.countNotify.onChange(function (conn, isOpen) {
      if (! conn.engine) return;
      var cs = clients[conn.engine];
      if (isOpen) {
        if (! cs) cs = clients[conn.engine] = {};
        var channel = cs[conn.sessId];
        if (! channel) {
          channel = cs[conn.sessId] = newConn(conn);
        }
        if (testExec.client && testMode !== 'server') {
          readyForTests(channel);
        }
      } else if (cs && (channel = cs[conn.sessId])) {
        --clientCount;
        ws.send('D'+channel.key);
        delete cs[conn.sessId];
        if (util.isObjEmpty(cs))
          delete clients[conn.engine];
      }
    });

    function testWhenReady() {
      if (testMode !== 'none') {
        if (testMode !== 'server' &&
            testExec.client && clientCount) {
          top:
          for (var key in clients) {
            var cs = clients[key];
            for (var sessId in cs) {
              var channel = cs[sessId];
              if (! readyForTests(channel))
                break top;
            }
          }
        }
        if (testMode !== 'client' &&
            testExec.server && testClientCount === 0) {
          ws.send('XServer');
          var server = testExec.server;
          testExec.server = null;
          server();
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
            var ct = testExec.clientTests;

            if (ct) {
              if (testClientCount === 1)
                pendingClientTests = [ct];
              else {
                var ctLen = ct.length;
                testClientCount = Math.max(1, Math.min(testClientCount, ctLen));
                pendingClientTests = new Array(testClientCount);
                for(var i = 0; i < testClientCount; ++i) {
                  pendingClientTests[i] = [];
                }

                for(var i = 0; i < ctLen; ++i) {
                  pendingClientTests[i % testClientCount].push(ct[i]);
                }
              }
            }
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

    function readyForTests(channel) {
      if (pendingClientTests.length === 0) return false;
      channel.tests = pendingClientTests.pop();
      testExec.client(channel.conn, channel.tests);
      ws.send('X'+channel.key);
      return true;
    }

    function testHandle(msg) {
      try {
        ws.send(msg[0] + channelKey(this) + '\x00' + msg.slice(1));
        if (msg[0] === 'F') {
          var cs = clients[this.engine];
          var channel = cs && cs[this.sessId];
          if (channel && channel.tests) {
            channel.tests = null;
            if (--testClientCount === 0) {
              if (testExec.server) {
                testExec.client = null;
                testWhenReady();
                return;
              }
            } else if (pendingClientTests.length) {
              readyForTests(channel);
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
      var key = channelKey(this);
      key !== 'Server' && console.log('INFO ' + key + ' ' + msg);
      try {
        ws.send('L' + channelKey(this) + '\x00' + msg);
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
