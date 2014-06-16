define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var koru = require('./main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test getLocation": function () {
      if (isClient)
        assert.same(koru.getLocation(), window.location);
      else
        assert(isServer);
    },

    "test isServer, isClient": function () {
      assert.same(isClient, typeof process === 'undefined');
      assert.same(isServer, typeof process !== 'undefined');
    },
  });
});
