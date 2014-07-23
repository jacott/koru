define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var md5sum = require('./md5sum');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test md5sum": function () {
      assert.same(md5sum("hello world"), '5eb63bbbe01eeed093cb22bb8f5acdc3');
    },
  });
});
