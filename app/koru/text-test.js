define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test require": function () {
      var text = require('./text!./test-data/example.sql');
      assert.same(text, 'select * from foo\n');
    },

  });
});
