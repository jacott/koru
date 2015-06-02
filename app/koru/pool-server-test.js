define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./pool-server');
  var koru = require('./main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test destroy": function () {
      test.stub(koru, 'setTimeout').returns(123);
      test.stub(koru, 'clearTimeout');
      var pool = new sut({
        create: v.create = test.stub(),
        destroy: v.destroy = test.stub(),
      });


    },
  });
});
