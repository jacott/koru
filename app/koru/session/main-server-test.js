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
          throw new koru.Error(404, 'not found');
        });

        assert.calledWith(v.conn.sendBinary, 'M', ['123', 'e', '404,not found']);
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

      test.spy(conn, 'closed');

      v.func();

      assert.called(conn.closed);
      refute(conn.sessId in session.conns);
    },
  });
});
