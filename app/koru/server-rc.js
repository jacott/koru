const fs = require('fs');
const vm = require('vm');

define((require, exports, module)=>{
  'use strict';
  const Intercept       = require('koru/test/intercept');
  const util            = require('koru/util');
  const koru            = require('./main');
  const session         = require('./session');
  const buildCmd        = require('./test/build-cmd');

  session.remoteControl = remoteControl;

  remoteControl.engine = 'Server';

  function remoteControl(ws) {
    ws.on('error', err => {
      ws.close();
    });
    const session = this;
    const clients = {};

    let lastSent = 0, lastMsg = '';
    let testMode = 'none', testExec = {client: null, server: null};
    let testClientCount = 0, pendingClientTests = [];
    let clientCount = 0;

    const logHandle = msg =>{
      const {connection} = util.thread;
      const key = connection === void 0 ? 'Server' : connection.engine;
      if (connection !== void 0) msg = connection.sessId + ': ' + msg;
      console.log(key + ' ' + msg);
      try {
        ws.send('L' + key + '\x00' + msg);
      } catch(ex) {} // ignore
    };

    koru.logger = (type, ...args)=>{
      if (type === 'D')
        logHandle('D> '+util.inspect(args, 7));
      else if (type === 'C')
        logHandle(args.join(' '));
      else
        logHandle(type+'> '+args.join(' '));
    };
    const oldTestHandle = session.provide('T', testHandle);

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

    const testWhenReady = ()=>{
      lastSent = 0; lastMsg = '';
      if (testMode !== 'none') {
        if (testMode !== 'server' && testExec.client !== null && clientCount) {
          const apt = pendingClientTests;
          if (testClientCount == 0) testClientCount = 1;
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
      session.provide('T', oldTestHandle);
    });
    ws.on('message', (data, flags)=>{
      const [cmd] = data.split('\t', 1);
      switch(cmd) {
      case 'T':
        const [type, pattern, count] = data.slice(cmd.length+1).split('\t', 3);
        testClientCount = +count;
        koru.runFiber(()=>{
          try {
            buildCmd.runTests(session, type, pattern, (mode, exec)=>{
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
        const [cmd2, a1, a2, interceptPrefix] = data.slice(cmd.length+1).split('\t', 4);
        switch(cmd2) {
        case 'bp':
          const id = a1.replace(/^app\//, '');
          const epos = +a2 - 1;
          const source = data.slice(a1.length + a2.length + interceptPrefix.length + 8);
          Intercept.ws = ws;
          Intercept.breakPoint(id, epos, interceptPrefix, source);
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
        koru.unhandledException(ex);
      }
    }

    const _testHandle = (conn, msg)=>{
      const type = msg[0];
      if (type === 'A') {
        newConn(conn);
        if (testExec.client !== null && testMode !== 'server') {
          readyForTests(conn);
        }
        return;
      }
      if (type === 'I') {
        Intercept.finishIntercept();
        ws.send(msg);
        return;
      }

      const {engine} = conn;
      msg = msg.slice(1);

      const cs = clients[engine];
      const sent = (type !== 'R' && type !== 'F') || cs === undefined || cs.conns.size === 1;
      if (sent) {
        const now = Date.now();
        if (type !== 'R' || now-50 > lastSent) {
          lastSent = now;
          lastMsg !== '' && ws.send('R' + engine + '\x00' + lastMsg);
          if (type === 'R')
            lastMsg = msg;
          else {
            ws.send(type + engine + '\x00' + msg);
            lastMsg = '';
          }
        } else {
          lastMsg = msg;
        }
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
              testExec.client = null;
              if (testExec.server) {
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


  }

  koru.onunload(module, 'reload');
});
