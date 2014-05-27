isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var session = require('./server-main');
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

    "test rpc": function () {
      session.defineRpc('foo.rpc', rpcMethod);

      session._onMessage(v.conn = test.stub(), 'Mfoo.rpc'+JSON.stringify([1,2,3]));

      assert.equals(v.args, [1, 2, 3]);
      assert.same(v.thisValue, v.conn);

      function rpcMethod(one, two, three) {
        v.thisValue = this;
        v.args = util.slice(arguments);
      }
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
