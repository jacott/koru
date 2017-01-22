define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test require"() {
      var text = require('./text!./test-data/example.sql');
      assert.same(text, 'select * from foo\n');
    },

  });
});
