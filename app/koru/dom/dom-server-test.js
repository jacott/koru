define(function (require, exports, module) {
  var test, v;
  const TH  = require('koru/test/main');
  const Dom = require('./dom-server');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test has document"() {
      assert.same(Dom.h({id: 'food'}).nodeType, document.ELEMENT_NODE);
    },
  });
});
