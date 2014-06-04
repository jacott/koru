isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var session = require('./main');
  var util = require('../util');
  var env = require('../env');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.ws = TH.mockWs();
    },

    tearDown: function () {
      v = null;
    },

    "rpc": {
      setUp: function () {
        v.run = function (rpcMethod) {
          session.defineRpc('foo.rpc', rpcMethod);

          session._onMessage(v.conn = {ws: v.ws}, 'M123|foo.rpc'+JSON.stringify([1,2,3]));
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

        assert.calledWith(v.ws.send, 'M123|r"result"');
      },

      "test exception": function () {
        v.run(function (one, two, three) {
          throw new env.Error(404, 'not found');
        });

        assert.calledWith(v.ws.send, 'M123|e404,not found');
      },
    },

    "test onclose": function () {
      test.stub(env, 'info');
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
