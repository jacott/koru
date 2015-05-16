isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./modal');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    // see SelectMenu for more comprehensive testing of positioning

    "test appendBelow": function () {
      test.stub(sut, 'append');

      sut.appendBelow('gp', 'origin');

      assert.calledWith(sut.append, 'below', 'gp', 'origin');
    },

    "test appendAbove": function () {
      test.stub(sut, 'append');

      sut.appendAbove('gp', 'origin');

      assert.calledWith(sut.append, 'above', 'gp', 'origin');
    },
  });
});
