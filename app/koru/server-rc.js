const fs = require('fs');
const vm = require('vm');

define((require, exports, module)=>{
  const util            = require('koru/util');
  const koru            = require('./main');
  const session         = require('./session');
  const buildCmd        = require('./test/build-cmd');

  koru.onunload(module, 'reload');

  session.remoteControl = remoteControl;

  remoteControl.engine = 'Server';


  function remoteControl(ws) {
    const session = this;

    let testMode = 'none', testExec = {};
    let testClientCount = 0, pendingClientTests = [];
    let future, interceptObj;
    let clientCount = 0;

    function logHandle(msg) {
      const key = channelKey(this);
      key !== 'Server' && console.log('INFO ' + key + ' ' + msg);
      try {
        ws.send('L' + channelKey(this) + '\x00' + msg);
      } catch(ex) {
        // ignore since it will just come back to us
      }
    }

    const intercept = (obj)=>{
      interceptObj = obj;
      ws.send('I' + util.extractError(new Error("interrupt")));
      future = new util.Future;
      try {
        return future.wait();
      } finally {
        future = null;
      }
    };

    const continueIntercept = (arg)=>{if (future) future.return(arg)};

    const oldLogHandle = session.provide('L', logHandle);
    const oldTestHandle = session.provide('T', testHandle);

    koru._INTERCEPT = intercept;

    // used by koru/test
    remoteControl.testHandle = testHandle;
    remoteControl.logHandle = logHandle;

    const channelKey = (conn)=>{
      const {engine} = conn;
      if (engine === 'Server')
        return engine;
      else
        return engine+'-'+conn.sessId;
    };

    const newConn = (conn)=>{
      const key = channelKey(conn);
      ws.send('A'+key);
      ++clientCount;
      return {conn, key};
    };

    const clients = {};
    for (let key in session.conns) {
      const conn = session.conns[key];
      let cs = clients[conn.engine];
      if (! cs) cs = clients[conn.engine] = {};
      cs[key] = newConn(conn);
    }

    ws.send('AServer');

    session.countNotify.onChange((conn, isOpen)=>{
      if (! conn.engine) return;
      const cs = clients[conn.engine];
      let channel;
      if (! isOpen && cs && (channel = cs[conn.sessId])) {
        --clientCount;
        ws.send('D'+channel.key);
        delete cs[conn.sessId];
        if (util.isObjEmpty(cs))
          delete clients[conn.engine];
      }
    });

    const testWhenReady = ()=>{
      if (testMode !== 'none') {
        if (testMode !== 'server' &&
            testExec.client && clientCount) {
          top: for (const key in clients) {
            const cs = clients[key];
            for (const sessId in cs) {
              const channel = cs[sessId];
              if (! readyForTests(channel))
                break top;
            }
          }
        }
        if (testMode !== 'client' &&
            testExec.server && testClientCount === 0) {
          ws.send('XServer');
          const {server} = testExec;
          testExec.server = null;
          server();
        }
      }
    };

    ws.on('close', ()=>{
      session.provide('L', oldLogHandle);
      session.provide('T', oldTestHandle);
    });
    ws.on('message', (data, flags)=>{
      const args = data.split('\t');
      switch(args[0]) {
      case 'T':
        testClientCount = +args[3];
        koru.runFiber(()=>{
          try {
            buildCmd.runTests(session, args[1], args[2], (mode, exec)=>{
              testMode = mode;
              testExec = exec;
              if (mode === 'client')
                testExec.server = null;
              const ct = testExec.clientTests;

              if (ct) {
                if (testClientCount === 1)
                  pendingClientTests = [ct];
                else {
                  const ctLen = ct.length;
                  testClientCount = Math.max(1, Math.min(testClientCount, ctLen));
                  pendingClientTests = new Array(testClientCount);
                  for(let i = 0; i < testClientCount; ++i) {
                    pendingClientTests[i] = [];
                  }

                  for(let i = 0; i < ctLen; ++i) {
                    pendingClientTests[i % testClientCount].push(ct[i]);
                  }
                }
              }
              testWhenReady();
            });
          } catch(ex) {
            koru.unhandledException(ex);
            ws.send('FServer\x00' + ex.toString());
            ws.close();
          }
        });
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

    const readyForTests = (channel)=>{
      if (pendingClientTests.length === 0) return false;
      channel.tests = pendingClientTests.pop();
      testExec.client(channel.conn, channel.tests);
      ws.send('X'+channel.key);
      return true;
    };

    function testHandle(msg) {
      try {
        _testHandle(this, msg);
      } catch(ex) {
        koru.error(ex.stack);
      }
    }

    const _testHandle = (conn, msg)=>{
      if (msg[0] === 'A') {
        const cs = clients[conn.engine] = {};
        let channel = cs[conn.sessId];
        if (! channel) {
          channel = cs[conn.sessId] = newConn(conn);
        }
        if (testExec.client && testMode !== 'server') {
          readyForTests(channel);
        }
        return;
      }

      ws.send(msg[0] + channelKey(conn) + '\x00' + msg.slice(1));
      if (msg[0] === 'F') {
        const cs = clients[conn.engine];
        const channel = cs && cs[conn.sessId];
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
    };
  }
});
