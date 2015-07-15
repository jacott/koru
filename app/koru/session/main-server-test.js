isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var session = require('./main');
  var util = require('../util');
  var koru = require('../main');
  var message = require('./message');
  var serverSession = require('./main-server');
  var IdleCheck = require('../idle-check').singleton;

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
        var waitIdle = test.spy(IdleCheck, 'waitIdle');

        v.sess.stop(v.stub = test.stub());
        assert.called(v.stub);
        assert.called(v.sess.wss.close);
        assert.calledWith(waitIdle, v.stub);
      },

      "test unload client only": function () {
        test.stub(requirejs, 'defined');
        test.stub(koru, 'unload');
        test.stub(v.sess, 'sendAll');

        v.sess.versionHash = '1234';

        v.sess.unload('foo');

        refute.called(koru.unload);

        assert.calledWith(v.sess.sendAll, 'U', '1234:foo');
      },

      "test unload server": function () {
        test.stub(requirejs, 'defined').withArgs('foo').returns(true);
        test.stub(koru, 'unload');
        test.stub(v.sess, 'sendAll');

        v.sess.versionHash = '1234';

        v.sess.unload('foo');

        assert.calledWith(koru.unload, 'foo');

        refute.same(v.sess.versionHash, '1234');

        assert.calledWith(v.sess.sendAll, 'U', v.sess.versionHash+':foo');
      },

      "test versionHash": function () {
        assert.calledWith(v.ws.on, 'connection', TH.match(function (func) {
          return v.func = func;
        }));

        assert.between(v.sess.versionHash, Date.now() - 2000, Date.now() + 2000);

        v.sess.versionHash = 'hash,v1';

        test.stub(koru, 'info');
        v.func(v.ws);

        assert.calledWith(v.ws.send, 'X1hash,v1');
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
          var buffer = message.encodeMessage('M', data);

          session._onMessage(v.conn = {ws: v.ws, sendBinary: test.stub()}, buffer);
        };
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
        assert.same(v.error.message, '{foo: "not found"} [404]');
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
      test.stub(koru, 'info');
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
