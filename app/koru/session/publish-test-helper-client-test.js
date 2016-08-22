define(function (require, exports, module) {
  /**
   * Utilities to help test publish/subscribe
   **/
  var test, v;
  const api       = require('koru/test/api');
  const TH        = require('koru/test/main');
  const publishTH = require('./publish-test-helper-client');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module(null, 'publishTH');
    },

    tearDown() {
      v = null;
    },

    "test mockSubscribe"() {
      /**
       * Subscribe to a publication but do not call server.
       **/
      api.method('mockSubscribe');
      const sub = publishTH.mockSubscribe("Foo");
      assert(sub);
    },
  });
});
