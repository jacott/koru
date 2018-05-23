define(function (require, exports, module) {
  const TH = require('./test');
  const koru = require('./main');

  let v = null;

  TH.testCase(module, {
    setUp() {
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
