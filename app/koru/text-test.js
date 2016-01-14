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

    "test require": function (done) {
      require('./text!./example.sql', function (sql) {
        assert(false);
      }, done);
    },

  });
});
