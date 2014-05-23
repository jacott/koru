isServer && define(function (require, exports, module) {
  var test, v;
  var bt = require('bart/test');
  var session = require('./server-main');
  var util = require('../util');

  bt.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
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
  });
});
