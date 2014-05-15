define(function (require, exports, module) {
  var test, v;
  var geddon = require('bart/test');
  var session = require('./client-main');


  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
      delete session._rpcs['foo.bar'];
    },

    "test rpc": function () {
      session.defineRpc('foo.rpc', v.stub = test.stub());

      session.rpc('foo.rpc', 1, 2, 3);

      assert.calledWith(v.stub, 1, 2, 3);
    },
  });
});
