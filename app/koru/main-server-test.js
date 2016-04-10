define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test afTimeout": function () {
      test.stub(sut, 'setTimeout').returns(123);
      var stop = sut._afTimeout(v.stub = test.stub, 1000);

      assert.calledWith(sut.setTimeout, v.stub, 1000);

      test.spy(global, 'clearTimeout');
      stop();
      assert.calledWith(global.clearTimeout, 123);
    },
  });
});
