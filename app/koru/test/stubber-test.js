define(function (require, exports, module) {
  var test, v;
  var TH = require('../test-helper');
  var sut = require('./stubber');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test hello": function () {
      var x = test.stub();
      x(123, 456);
      assert.called(x);
      assert.calledWith(x, 123, 455);
    },
  });
});
