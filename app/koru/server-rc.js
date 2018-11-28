const fs = require('fs');
const vm = require('vm');

define((require, exports, module)=>{
  const util            = require('koru/util');
  const koru            = require('./main');
  const session         = require('./session');
  const buildCmd        = require('./test/build-cmd');

  session.remoteControl = remoteControl;

  remoteControl.engine = 'Server';

  function remoteControl(ws) {
    const session = this;
    const clients = {};

    let testMode = 'none', testExec = {client: null, server: null};
    let testClientCount = 0, pendingClientTests = [];
    let future, interceptObj;
    let clientCount = 0;

    const logHandle = msg =>{
      const {connection} = util.thread;
      const key = connection == null ? 'Server' : connection.engine;
      key !== 'Server' && console.log('INFO ' + key + ' ' + msg);
      try {
        ws.send('L' + key + '\x00' + msg);
      } catch(ex) {} // ignore
    };

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

    koru.logger = (type, ...args)=>{
      if (type === '\x44EBUG')
        logHandle(type+ ': '+util.inspect(args, 7));
      else
        logHandle(args.join(' '));
    };
    const oldLogHandle = session.provide('L', logHandle);
    const oldTestHandle = session.provide('T', testHandle);

    koru._INTERCEPT = intercept;

    // used by koru/test
    remoteControl.testHandle = testHandle;
    remoteControl.logHandle = logHandle;

    const newConn = (conn)=>{
      const {engine} = conn;
      let cs = clients[engine];
      if (cs === undefined) {
        ws.send('A'+engine);
        ++clientCount;
        cs = clients[engine] = {
          conns: new Map, engine,
          runCount: 0,
          results: undefined,
          pendingTests: [pendingClientTests],
        };
      }

      cs.conns.set(conn, {tests: null, results: null});
      testWhenReady(conn);
    };

    for (let key in session.conns) {
      const conn = session.conns[key];
      newConn(conn);
    }

    ws.send('AServer');

    session.countNotify.onChange((conn, isOpen)=>{
      const {engine} = conn;
      if (! engine || isOpen) return;
      const cs = clients[engine];
      if (cs === undefined) return;
      cs.conns.delete(conn);
      if (cs.conns.size === 0) {
        delete clients[engine];
        --clientCount;
        ws.send('D'+engine);
      }
    });

    const testWhenReady = ()=>{
      if (testMode !== 'none') {
        if (testMode !== 'server' && testExec.client !== null && clientCount) {
          const apt = pendingClientTests;
          pendingClientTests = [];
          for (const key in clients) {
            const cs = clients[key], {conns} = cs;
            const len = conns.size;
            if (len < 2)
              cs.pendingTests = [apt];
            else {
              const pt = cs.pendingTests = [];
              for (let i = 0; i < len; ++i)
                pt.push([]);

              const ctLen = apt.length;
              for (let i = 0; i < ctLen; ++i) {
                pt[i % len].push(apt[i]);
              }
            }

            for (const conn of conns.keys()) {
              if (! readyForTests(conn))
                break;
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

              if (testExec.clientTests) {
                pendingClientTests = testExec.clientTests;
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

    const readyForTests = (conn)=>{
      const cs = clients[conn.engine];
      const {pendingTests} = cs;
      if (pendingTests.length === 0) return false;
      const data = cs.conns.get(conn);
      testExec.client(conn, data.tests = pendingTests.pop());
      if (++cs.runCount == 1)
        ws.send('X'+conn.engine);
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
        newConn(conn);
        if (testExec.client !== null && testMode !== 'server') {
          readyForTests(conn);
        }
        return;
      }

      const {engine} = conn;
      const type = msg[0];
      msg = msg.slice(1);

      const cs = clients[engine];
      const sent = (type !== 'R' && type !== 'F') || cs === undefined || cs.conns.size === 1;
      if (sent) {
        ws.send(type + engine + '\x00' + msg);
      } else if (type === 'R') {
        const parts = msg.split('\x00');
        const {conns} = cs;
        conns.get(conn).results = parts[1].split(' ').map(d => +d);
        let ans;
        for (const {results} of conns.values()) {
          if (results != null) {
            if (ans === undefined)
              cs.results = ans = results.slice();
            else for(let i = 0; i < ans.length; ++i) {
              ans[i] += results[i];
            }
          }
        }
        ws.send(type + engine + '\x00' + parts[0]+ '\x00'+ ans.join(' '));
      }

      if (type === 'F') {
        if (cs !== undefined) {
          const data = cs.conns.get(conn);
          data.tests = null;
          readyForTests(conn);
          if (--cs.runCount == 0) {
            sent || ws.send(
              type + engine + '\x00' +
                (cs.results === undefined || cs.results[2] !== 0 ||
                 cs.results[1] !== cs.results[2] ? '1' : '0'));

            if (--testClientCount === 0) {
              if (testExec.server) {
                testExec.client = null;
                testWhenReady();
                return;
              }
            }
          }
        }
        if (testClientCount != 0 || testExec.server) return;
        ws.send('Z');
      }
    };
  }

  koru.onunload(module, 'reload');
});
