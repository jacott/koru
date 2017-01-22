define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var koru = require('./main');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test getLocation"() {
      if (isClient)
        assert.same(koru.getLocation(), window.location);
      else
        assert(isServer);
    },

    "test isServer, isClient"() {
      assert.same(isClient, typeof process === 'undefined');
      assert.same(isServer, typeof process !== 'undefined');
    },
  });
});
