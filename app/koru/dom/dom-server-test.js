define(function (require, exports, module) {
  /**
   * Returns {#koru/dom/base}. Ensures server has {#koru/dom/html-doc}
   **/
  var test, v;
  const TH  = require('koru/test/main');
  const api = require('koru/test/api');
  const Dom = require('./dom-server');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test has document"() {
      assert.same(Dom.h({id: 'food'}).nodeType, document.ELEMENT_NODE);
    },
  });
});
