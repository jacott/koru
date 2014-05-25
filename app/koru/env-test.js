define(function (require, exports, module) {
  var test, v;
  var bt = require('koru/test');
  var env = require('./env');

  bt.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test getLocation": function () {
      if (isClient)
        assert.same(env.getLocation(), window.location);
      else
        assert(isServer);
    },
  });
});
