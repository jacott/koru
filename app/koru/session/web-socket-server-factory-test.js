define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const TransQueue      = require('koru/model/trans-queue');
  const Random          = require('koru/random');
  const SessionBase     = require('koru/session/base').constructor;
  const message         = require('koru/session/message');
  const ServerConnection = require('koru/session/server-connection');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy, intercept, match: m} = TH;

  const sut = require('./web-socket-server-factory');

  let v = {};

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      v.ws = TH.mockWs();
      v.mockSess = new SessionBase({});
      v.mockSess.wss = v.ws;
    });

    afterEach(() => {
      v = {};
    });

    test('stop', () => {
      const sess = sut(v.mockSess);

      sess.stop();
      assert.called(sess.wss.close);
    });

    group('rpc', () => {
      const makeConn = () => util.merge(new ServerConnection(v.sess, v.ws, '123', () => {}), {
        sendBinary: stub(),
      });

      beforeEach(() => {
        v.sess = sut(v.mockSess);
        v.msgId = 'm123';
        v.run = async (rpcMethod) => {
          v.sess.defineRpc('foo.rpc', rpcMethod);

          const data = [v.msgId, 'foo.rpc', 1, 2, 3];
          const buffer = message.encodeMessage('M', data, v.sess.globalDict);

          v.conn = makeConn();
          return await v.sess._onMessage(v.conn, buffer);
        };
      });

      test('in TransQueue transaction failure', async () => {
        let inTrans = false;
        v.sess.defineRpc('foo.rpc', () => {
          assert.isTrue(inTrans);
          throw new koru.Error(404, 'not found');
        });
        intercept(TransQueue, 'transaction', async (func) => {
          inTrans = true;
          try {
            return func();
          } finally {
            inTrans = false;
          }
        });
        const conn = makeConn();
        conn.sendBinary.invokes((c) => {
          assert.isFalse(inTrans);
        });
        const p = v.sess._commands.M.call(conn, [v.msgId, 'foo.rpc', 1, 2, 3]);
        assert(isPromise(p));
        await p;
        assert.calledWith(conn.sendBinary, 'M', ['m123', 'e', 404, 'not found']);
      });

      test('in TransQueue transaction success', async () => {
        let inTrans = false;
        v.sess.defineRpc('foo.rpc', async () => {
          assert.isTrue(inTrans);
          return 'success';
        });
        intercept(TransQueue, 'transaction', (func) => {
          inTrans = true;
          try {
            return func();
          } finally {
            inTrans = false;
          }
        });
        const conn = makeConn();
        conn.sendBinary.invokes((c) => {
          assert.isFalse(inTrans);
        });
        await v.sess._commands.M.call(conn, [v.msgId, 'foo.rpc', 1, 2, 3]);
        assert.calledWith(conn.sendBinary, 'M', ['m123', 'r', 'success']);
      });

      test('Random.id', async () => {
        v.msgId = 'a1212345671234567890';
        await v.run((arg) => {
          assert.same(Random.id(), 'Fs3Fn26qRzQI9PL1H');
          v.ans = Random.id();
        });

        assert.same(v.ans, 'W2gquYPP21ZS1N14d');

        v.msgId = 'a12123456712345678Aa';
        await v.run((arg) => {
          assert.same(util.thread.msgId, 'a12123456712345678Aa');

          assert.same(Random.id(), 'FFykqEzyflL6oKnqR');
          v.ans = Random.id();
        });

        assert.same(v.ans, 'ygIaapK60J3Lx3KGY');
      });

      test('old msgId', async () => {
        v.msgId = 'a1212';
        await v.run((arg) => {
          refute.same(Random.id(), 'XDYyyXJ6M7iSTHjwZ');
          v.ans = Random.id();
        });

        refute.same(v.ans, '9kPL9inAgQw7bp9ZL');
      });

      test('result', async () => {
        await v.run(async function (...args) {
          v.thisValue = this;
          v.args = args.slice();
          return 'result';
        });

        assert.equals(v.args, [1, 2, 3]);
        assert.same(v.thisValue, v.conn);

        assert.calledWith(v.conn.sendBinary, 'M', ['m123', 'r', 'result']);
      });

      test('exception', async () => {
        stub(koru, 'error');
        await v.run((one, two, three) => {
          throw v.error = new koru.Error(404, {foo: 'not found'});
        });

        assert.calledWith(v.conn.sendBinary, 'M', ['m123', 'e', 404, {foo: 'not found'}]);
        assert.same(v.error.message, "{foo: 'not found'}");
      });

      test('general exception', async () => {
        stub(koru, 'error');
        await v.run((one, two, three) => {
          throw new Error('Foo');
        });

        assert.calledWith(v.conn.sendBinary, 'M', ['m123', 'e', 'Error: Foo']);
      });
    });

    test('unload client only', () => {
      const sess = sut(v.mockSess);
      stub(koru, 'unload');
      stub(sess, 'sendAll');

      sess.versionHash = '1234';

      sess.unload('foo');

      refute.called(koru.unload);

      assert.calledWith(sess.sendAll, 'U', '1234:foo');
    });

    test('initial KORU_APP_VERSION', () => {
      TH.stubProperty(koru, 'version', 'dev');
      TH.stubProperty(koru, 'versionHash', 'h1');
      const sess = sut(v.mockSess);

      assert.same(sess.versionHash, 'h1');
      assert.same(sess.version, 'dev');
    });

    group('onConnection', () => {
      beforeEach(() => {
        v.sess = sut(v.mockSess);
        v.assertSent = (args) => {
          assert.elide(() => {
            assert.calledOnceWith(v.ws.send, m((arg) => {
              v.msg = message.decodeMessage(arg.subarray(1), v.sess.globalDict);
              assert.equals(v.msg, args);

              return arg[0] === 88;
            }, args));
          });
          v.ws.send.reset();
        };
      });

      test('wrong protocol received', () => {
        v.ws[isTest].request.url = '/4/dev/';

        v.sess.onConnection(v.ws, v.ws[isTest].request);

        assert.calledWith(v.ws.send, m(/^Uh\d+$/));
        assert.calledWith(v.ws.send, 'Lforce-reload');
      });

      group('dictHash', () => {
        beforeEach(() => {
          v.sess.addToDict('Helium');
          v.sess.addToDict('Tungsten');
          v.ws[isTest].request.url = `/ws/${koru.PROTOCOL_VERSION}/v1.2.2/h123`;
          v.sess.versionHash = 'h123';
          v.sess.version = 'v1.2.2';
          TH.noInfo();
        });

        test('wrong dictHash received', () => {
          v.ws[isTest].request.url += '?dict=abcdf23';
          v.sess.onConnection(v.ws, v.ws[isTest].request);
          v.assertSent([
            '', 'h123',
            m((dict) => v.dict = dict),
            '0e91d53512b2d4fd787d74afc8b21253efc1ea6eb52a3a88a694b0cc6ae716b0']);

          assert.equals(Array.from(v.dict), [
            72, 101, 108, 105, 117, 109, 255, 84, 117, 110, 103, 115, 116, 101, 110, 255, 0,
          ]);
        });

        test('correct dictHash received', () => {
          v.ws[isTest].request.url +=
            '?dict=0e91d53512b2d4fd787d74afc8b21253efc1ea6eb52a3a88a694b0cc6ae716b0';
          v.sess.onConnection(v.ws, v.ws[isTest].request);
          v.assertSent(['', 'h123', null, undefined]);
        });
      });

      group('compareVersion', () => {
        beforeEach(() => {
          v.ws[isTest].request.url = `/ws/${koru.PROTOCOL_VERSION}/v1.2.2/h123`;
          v.sess.versionHash = 'h456';
          v.sess.version = 'v1.2.3';
          TH.noInfo();
        });

        test('remote info', () => {
          v.ws[isTest].request.connection = {remoteAddress: '127.0.0.1', remotePort: '12345'};
          v.ws[isTest].request.headers = {
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/59.0.3071.104 Safari/537.36',
            'x-real-ip': '11.22.33.44',
          };

          v.sess.onConnection(v.ws, v.ws[isTest].request);

          const conn = v.sess.conns[1];
          assert.equals(v.sess.totalSessions, 1);
          assert.equals(conn.engine, 'Chrome-59.0.3071.104');
          assert.equals(conn.remoteAddress, '11.22.33.44');
          assert.equals(conn.remotePort, '12345');
        });

        test('override halts response', () => {
          stub(util, 'compareVersion');
          const compareVersion = v.sess.compareVersion = stub().returns(1);

          v.sess.onConnection(v.ws, v.ws[isTest].request);

          refute.called(util.compareVersion);
          assert.calledWith(compareVersion, 'v1.2.2', 'h123');
          assert.same(compareVersion.lastCall.thisValue, v.sess);

          refute.called(v.ws.send);
        });

        test('override reloads', () => {
          stub(util, 'compareVersion');
          const compareVersion = v.sess.compareVersion = stub().returns(-1);

          v.sess.onConnection(v.ws, v.ws[isTest].request);

          refute.called(util.compareVersion);
          assert.called(compareVersion);

          v.assertSent(['v1.2.3', 'h456', m.any, m.string]);
        });

        test('force-reload', () => {
          stub(util, 'compareVersion');
          const compareVersion = v.sess.compareVersion = stub().returns(-2);

          v.sess.onConnection(v.ws, v.ws[isTest].request);

          assert.calledWith(v.ws.send, 'Uh456');
          assert.calledWith(v.ws.send, 'Lforce-reload');
          assert.called(v.ws.close);
        });

        test('compareVersion', () => {
          /** client < server **/
          v.sess.onConnection(v.ws, v.ws[isTest].request);
          v.assertSent(['v1.2.3', 'h456', m.any, m.string]);

          /** client > server **/
          v.sess.version = 'v1.2.1';
          v.sess.onConnection(v.ws, v.ws[isTest].request);
          refute.called(v.ws.send);

          /** client == server **/
          v.sess.version = 'v1.2.2';
          v.sess.onConnection(v.ws, v.ws[isTest].request);
          v.assertSent(['', 'h456', m.any, m.string]);
        });

        test('no version,hash', () => {
          v.ws[isTest].request.url = `/ws/${koru.PROTOCOL_VERSION}/v1.2.2/`;
          v.sess.onConnection(v.ws, v.ws[isTest].request);
          v.assertSent(['', 'h456', m.any, m.string]);
        });

        test('old version but good hash', () => {
          v.sess.versionHash = 'h123';
          v.sess.onConnection(v.ws, v.ws[isTest].request);
          v.assertSent(['', 'h123', m.any, m.string]);
        });
      });
    });

    test('override NewConnection', () => {
      v.mockSess.ServerConnection = class extends ServerConnection {
        constructor(...args) {
          super(...args);
          this.onMessage = stub();
        }
      };
      const onMessage = v.ws.on.withArgs('message');
      const sess = sut(v.mockSess);
      v.ws[isTest].request.url = `/ws/${koru.PROTOCOL_VERSION}/v1.2.2/h123`;
      sess.versionHash = 'h456';
      sess.version = 'v1.2.3';
      TH.noInfo();
      sess.onConnection(v.ws, v.ws[isTest].request);

      assert.calledOnceWith(onMessage, 'message', m.func);

      const conn = sess.conns[1];
      onMessage.yield('testing');
      assert.calledWith(conn.onMessage, 'testing');
    });

    test('unload server', () => {
      const sess = sut(v.mockSess);
      stub(sess, 'sendAll');
      const {ctx} = requirejs.module;
      after(() => {delete ctx.modules.foo});
      ctx.modules.foo = {unload: stub()};

      sess.versionHash = '1234';

      sess.unload('foo');

      assert.called(ctx.modules.foo.unload);

      refute.same(sess.versionHash, '1234');

      assert.calledWith(sess.sendAll, 'U', sess.versionHash + ':foo');
    });
  });
});
