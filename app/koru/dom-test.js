define(function (require, exports, module) {
  var test, v;
  const api  = require('koru/test/api');
  const TH   = require('koru/test');
  const sut  = require('./dom');
  const base = require('./dom/base');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test "() {
      api.module();
      assert.same(base, sut);
    },
  });
});
