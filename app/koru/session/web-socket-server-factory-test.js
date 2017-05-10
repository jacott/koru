define(function (require, exports, module) {
  const koru           = require('koru');
  const Random         = require('koru/random');
  const SessionBase    = require('koru/session/base').constructor;
  const message        = require('koru/session/message');
  const Conn           = require('koru/session/server-connection-factory').Base;
  const util           = require('koru/util');
  const ConnectionBase = require('./server-connection-factory').Base;
  const TH             = require('./test-helper');

  const sut = require('./web-socket-server-factory');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.ws = TH.mockWs();
      v.mockSess = new SessionBase({});
      v.mockSess.wss = v.ws;
    },

    tearDown() {
      v = null;
    },

    "test stop"() {
      const sess = sut(v.mockSess);

      sess.stop();
      assert.called(sess.wss.close);
    },

    "rpc": {
      setUp() {
        v.sess = sut(v.mockSess);
        v.msgId = 'm123';
        v.run = rpcMethod => {
          v.sess.defineRpc('foo.rpc', rpcMethod);

          const data = [v.msgId, 'foo.rpc', 1, 2, 3];
          const buffer = message.encodeMessage('M', data, v.sess.globalDict);

          v.conn = util.merge(new Conn(v.ws, '123', () => {}), {
            batchMessages: this.stub(),
            releaseMessages: this.stub(),
            abortMessages: this.stub(),
            sendBinary: this.stub(),
          });
          v.sess._onMessage(v.conn, buffer);
        };
      },

      "test Random.id"() {
        v.msgId = "a1212345671234567890";
        v.run(arg => {
          assert.same(Random.id(), "53WvgALyAjBQW7BJF");
          v.ans = Random.id();
        });

        assert.same(v.ans, 'qnem23EJbTPoFbt3w');

        v.msgId = "a12123456712345678Aa";
        v.run(arg => {
          assert.same(util.thread.msgId, 'a12123456712345678Aa');

          assert.same(Random.id(), "Z8bHgA4SxwAwbNtzW");
          v.ans = Random.id();
        });

        assert.same(v.ans, 'm2SM9qzob6D9Y6GZb');
      },

      "test old msgId"() {
        v.msgId = "a1212";
        v.run(arg => {
          refute.same(Random.id(), "XDYyyXJ6M7iSTHjwZ");
          v.ans = Random.id();
        });

        refute.same(v.ans, '9kPL9inAgQw7bp9ZL');
      },

      "batch messages": {
        "test send after return"() {
          v.run((one, two, three) => {
            assert.called(v.conn.batchMessages);
            refute.called(v.conn.releaseMessages);
            return 'result';
          });

          refute(util.thread.batchMessage);
          assert.calledWith(v.conn.sendBinary, 'M', ['m123', 'r', 'result']);
          assert(v.conn.releaseMessages.calledAfter(v.conn.sendBinary));
          refute.called(v.conn.abortMessages);
        },

        "test abort"() {
          v.run((one, two, three) => {
            assert.called(v.conn.batchMessages);
            refute.called(v.conn.releaseMessages);
            refute.called(v.conn.abortMessages);
            this.stub(koru, 'error');
            throw 'test aborted';
          });

          koru.error.restore();

          refute(util.thread.batchMessage);
          assert.calledWith(v.conn.sendBinary, 'M', ['m123', 'e', 'test aborted']);
          assert(v.conn.abortMessages.calledBefore(v.conn.sendBinary));
          refute.called(v.conn.releaseMessages);
        },

      },

      "test result"() {
        v.run(function (...args) {
          v.thisValue = this;
          v.args = args.slice();
          return 'result';
        });

        assert.equals(v.args, [1, 2, 3]);
        assert.same(v.thisValue, v.conn);

        assert.calledWith(v.conn.sendBinary, 'M', ['m123', "r", "result"]);
      },

      "test exception"() {
        this.stub(koru, 'error');
        v.run((one, two, three) => {
          throw v.error = new koru.Error(404, {foo: 'not found'});
        });

        assert.calledWith(v.conn.sendBinary, 'M', ['m123', 'e', 404, {foo: 'not found'}]);
        assert.same(v.error.message, "{foo: 'not found'} [404]");
      },

      "test general exception"() {
        this.stub(koru, 'error');
        v.run((one, two, three) => {
          throw new Error('Foo');
        });

        assert.calledWith(v.conn.sendBinary, 'M', ['m123', 'e', 'Error: Foo']);
      },
    },

    "test unload client only"() {
      const sess = sut(v.mockSess);
      this.stub(koru, 'unload');
      this.stub(sess, 'sendAll');

      sess.versionHash = '1234';

      sess.unload('foo');

      refute.called(koru.unload);

      assert.calledWith(sess.sendAll, 'U', '1234:foo');
    },

    "test initial KORU_APP_VERSION"() {
      this.onEnd(function () {
        delete process.env['KORU_APP_VERSION'];
      });

      process.env['KORU_APP_VERSION'] = "dev,h1";

      const sess = sut(v.mockSess);

      assert.same(sess.versionHash, "h1");
      assert.same(sess.version, "dev");
    },

    "test heartbeat response"() {
      const sess = sut(v.mockSess);

      assert(sess._commands.H);

      sess._commands.H.call({send: v.send = this.stub()}, 'H');

      assert.calledWith(v.send, 'K');
    },

    "onConnection": {
      setUp() {
        v.sess = sut(v.mockSess);
      },

      "test wrong protocol received"() {
        v.ws.upgradeReq.url = '/4/dev/';

        v.sess.onConnection(v.ws);

        assert.calledOnceWith(v.ws.send, 'Lforce-reload');
      },

      "compareVersion": {
        setUp() {
          v.ws.upgradeReq.url = `/ws/${koru.PROTOCOL_VERSION}/v1.2.2/h123`;
          v.sess.versionHash = 'h456';
          v.sess.version = 'v1.2.3';
          this.stub(koru, 'info');
          v.assertSent = (args) => {
            assert.elideFromStack.calledOnceWith(v.ws.send, TH.match(arg => {
              v.msg = message.decodeMessage(arg.subarray(1), v.sess.globalDict);
              assert.equals(v.msg, args);

              return arg[0] === 88;
            }, args));
            v.ws.send.reset();
          };
        },

        "test override halts response"() {
          this.stub(util, 'compareVersion');
          const compareVersion = v.sess.compareVersion = this.stub().returns(1);

          v.sess.onConnection(v.ws);

          refute.called(util.compareVersion);
          assert.calledWith(compareVersion, 'v1.2.2', 'h123');
          assert.same(compareVersion.lastCall.thisValue, v.sess);

          refute.called(v.ws.send);
        },

        "test override reloads"() {
          this.stub(util, 'compareVersion');
          const compareVersion = v.sess.compareVersion = this.stub().returns(-1);

          v.sess.onConnection(v.ws);

          refute.called(util.compareVersion);
          assert.called(compareVersion);

          v.assertSent(['v1.2.3', 'h456', TH.match.any]);
        },

        "test compareVersion"() {
          /** client < server **/
          v.sess.onConnection(v.ws);
          v.assertSent(['v1.2.3', 'h456', TH.match.any]);

          /** client > server **/
          v.sess.version = 'v1.2.1';
          v.sess.onConnection(v.ws);
          refute.called(v.ws.send);

          /** client == server **/
          v.sess.version = 'v1.2.2';
          v.sess.onConnection(v.ws);
          v.assertSent(['', 'h456', TH.match.any]);
        },

        "test no version,hash"() {
          v.ws.upgradeReq.url = `/ws/${koru.PROTOCOL_VERSION}/v1.2.2/`;
          v.sess.onConnection(v.ws);
          v.assertSent(['', 'h456', TH.match.any]);
        },

        "test old version but good hash"() {
          v.sess.versionHash = 'h123';
          v.sess.onConnection(v.ws);
          v.assertSent(['', 'h123', TH.match.any]);
        },
      },    },

    "test unload server"() {
      const sess = sut(v.mockSess);
      this.stub(sess, 'sendAll');
      const {ctx} = requirejs.module;
      this.onEnd(() => {delete ctx.modules.foo});
      ctx.modules.foo = {unload: this.stub()};

      sess.versionHash = '1234';

      sess.unload('foo');

      assert.called(ctx.modules.foo.unload);

      refute.same(sess.versionHash, '1234');

      assert.calledWith(sess.sendAll, 'U', sess.versionHash+':foo');
    },
  });
});
