isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var session = require('./main');
  var util = require('../util');
  var koru = require('../main');
  var message = require('./message');
  var serverSession = require('./main-server');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.ws = TH.mockWs();
      v.mockSess = {
        _wssOverride: function () {
          return v.ws;
        },
        provide: test.stub(),
        _rpcs: {},
      };
    },

    tearDown: function () {
      v = null;
    },

    "server setup": {
      setUp: function () {
        v.sess = serverSession(v.mockSess);
      },

      "test stop": function () {
        v.sess.stop();
        assert.called(v.sess.wss.close);
      },

      "test unload client only": function () {
        test.stub(koru, 'unload');
        test.stub(v.sess, 'sendAll');

        v.sess.versionHash = '1234';

        v.sess.unload('foo');

        refute.called(koru.unload);

        assert.calledWith(v.sess.sendAll, 'U', '1234:foo');
      },

      "test unload server": function () {
        var ctx = requirejs.module.ctx;
        test.onEnd(function () {
          delete ctx.modules.foo;
        });
        ctx.modules.foo = {unload: test.stub()};
        test.stub(v.sess, 'sendAll');

        v.sess.versionHash = '1234';

        v.sess.unload('foo');

        assert.called(ctx.modules.foo.unload);

        refute.same(v.sess.versionHash, '1234');

        assert.calledWith(v.sess.sendAll, 'U', v.sess.versionHash+':foo');
      },

      "test versionHash": function () {
        assert.calledWith(v.ws.on, 'connection', TH.match(function (func) {
          return v.func = func;
        }));

        v.sess.addToDict('foo');

        v.sess.registerGlobalDictionaryAdder({id: 'test'}, function (adder) {
          adder('g1'); adder('g2');
        });

        assert.between(v.sess.versionHash, Date.now() - 2000, Date.now() + 2000);

        v.sess.versionHash = 'hash,v1';

        TH.noInfo();
        v.func(v.ws);

        assert.calledWith(v.ws.send, TH.match(function (arg) {
          v.msg = message.decodeMessage(arg.subarray(1), session.globalDict);
          assert.equals(v.msg,
                        [1, 'hash,v1', TH.match.any]);

          return arg[0] === 88;
        }), {binary: true});

        var dict = message.newGlobalDict();

        assert.same(v.msg[2].length, 11);


        message.decodeDict(v.msg[2], 0, dict);
        message.finalizeGlobalDict(dict);

        assert.same(dict.k2c['g1'], 0xfffd);
        assert.same(dict.k2c['g2'], 0xfffe);

        assert.same(v.sess.globalDict.k2c['foo'], 0xfffc);
        assert.same(v.sess.globalDict.k2c['g2'], 0xfffe);
        assert.same(v.sess.globalDict.k2c['g1'], 0xfffd);

        v.sess.addToDict('fuz');

        assert.same(v.sess.globalDict.k2c['fuz'], undefined);
      },
    },

    "test initial KORU_APP_VERSION": function () {
      test.onEnd(function () {
        delete process.env['KORU_APP_VERSION'];
      });

      process.env['KORU_APP_VERSION'] = "hash,v1";

      v.sess = serverSession(v.mockSess);

      assert.same(v.sess.versionHash, "hash,v1");
    },

    "test heartbeat response": function () {
      v.sess = serverSession(v.mockSess);

      assert.calledWith(v.sess.provide, 'H', TH.match(function (func) {
        return v.func = func;
      }));

      v.func.call({send: v.send = test.stub()}, 'H');

      assert.calledWith(v.send, 'K');
    },

    "test client errors": function () {
       v.sess = serverSession(v.mockSess);

      assert.calledWith(v.sess.provide, 'E', TH.match(function (func) {
        return v.func = func;
      }));

      test.stub(koru, 'logger');
      v.sess.sessId = 's123';
      v.func.call({send: v.send = test.stub(), sessId: 's123', engine: 'test engine'}, 'hello world');
      assert.calledWith(koru.logger, 'INFO', 's123', 'test engine', 'hello world');
    },

    "rpc": {
      setUp: function () {
        v.run = function (rpcMethod) {
          session.defineRpc('foo.rpc', rpcMethod);

          var data = ['123', 'foo.rpc', 1, 2, 3];
          var buffer = message.encodeMessage('M', data, session.globalDict);

          session._onMessage(v.conn = {ws: v.ws, sendBinary: test.stub()}, buffer);
        };
      },

      "batch messages": {
        setUp: function () {
          test.spy(session, 'batchMessages');
          test.spy(session, 'releaseMessages');
          test.spy(session, 'abortMessages');
        },

        "test send after return": function () {
          v.run(function (one, two, three) {
            assert.called(session.batchMessages);
            assert(util.thread.batchMessage);
            refute.called(session.releaseMessages);
            v.release = test.stub(util.thread.batchMessage, 'release');
            return 'result';
          });

          refute(util.thread.batchMessage);
          assert.calledWith(v.conn.sendBinary, 'M', ['123', 'r', 'result']);
          assert(session.releaseMessages.calledAfter(v.conn.sendBinary));
          refute.called(session.abortMessages);
          assert.called(v.release);
        },

        "test abort": function () {
          v.run(function (one, two, three) {
            assert.called(session.batchMessages);
            assert(util.thread.batchMessage);
            v.abort = test.stub(util.thread.batchMessage, 'abort');
            refute.called(session.releaseMessages);
            test.stub(koru, 'error');
            throw 'test aborted';
          });

          koru.error.restore();

          refute(util.thread.batchMessage);
          assert.calledWith(v.conn.sendBinary, 'M', ['123', 'e', 'test aborted']);
          assert(session.abortMessages.calledBefore(v.conn.sendBinary));
          refute.called(session.releaseMessages);
          assert.called(v.abort);
        },
      },


      "test result": function () {
        v.run(function (one, two, three) {
          v.thisValue = this;
          v.args = util.slice(arguments);
          return 'result';
        });

        assert.equals(v.args, [1, 2, 3]);
        assert.same(v.thisValue, v.conn);

        assert.calledWith(v.conn.sendBinary, 'M', ['123', "r", "result"]);
      },

      "test exception": function () {
        test.stub(koru, 'error');
        v.run(function (one, two, three) {
          throw v.error = new koru.Error(404, {foo: 'not found'});
        });

        assert.calledWith(v.conn.sendBinary, 'M', ['123', 'e', 404, {foo: 'not found'}]);
        assert.same(v.error.message, "{foo: 'not found'} [404]");
      },

      "test general exception": function () {
        test.stub(koru, 'error');
        v.run(function (one, two, three) {
          throw new Error('Foo');
        });

        assert.calledWith(v.conn.sendBinary, 'M', ['123', 'e', 'Error: Foo']);
      },
    },

    "test onclose": function () {
      TH.noInfo();
      var conn = TH.sessionConnect(v.ws);

      assert.calledWith(v.ws.on, 'close', TH.match(function (func) {
        v.func = func;
        return typeof func === 'function';
      }));

      test.spy(conn, 'close');

      v.func();

      assert.called(conn.close);
      refute(conn.sessId in session.conns);
    },
  });
});
