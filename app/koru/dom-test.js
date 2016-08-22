define(function (require, exports, module) {
  /**
   * Main module to require for full Dom utilities.
   *
   * See {#koru/dom/base}, [koru/dom/dom-client](#koru/dom/dom-client)
   * and [koru/dom/dom-server](#koru/dom/dom-server)
   **/
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
