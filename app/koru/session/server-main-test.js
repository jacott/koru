isServer && define(function (require, exports, module) {
  var test, v;
  var bt = require('koru/test');
  var session = require('./server-main');
  var util = require('../util');
  var env = require('../env');

  bt.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.ws = {
        upgradeReq: {socket: {}, headers: {}},
        on: test.stub(),
        send: test.stub(),
      };
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
      session._onConnection(v.ws);

      var key = session._sessCounter.toString(16);
      var conn = session.conns[key];

      assert.calledWith(v.ws.on, 'close', bt.geddon.sinon.match(function (func) {
        v.func = func;
        return typeof func === 'function';
      }));

      test.spy(conn, 'closed');

      v.func();

      assert.called(conn.closed);

      refute(key in session.conns);

    },
  });
});
