define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var koru = require('./main');
  var util = require('./util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test setTimeout": function () {
      test.stub(isServer ? global : window, 'setTimeout').returns(123);
      test.stub(util, 'Fiber').returns({run: function () {
        util.Fiber.yield();
      }});

      var token = koru.setTimeout(v.stub = test.stub(), 123000);

      assert.calledWith(setTimeout, TH.match.func, 123000);

      assert.same(token, setTimeout.returnValues[0]);

      if (isServer) assert.calledWith(util.Fiber, TH.match.func);

      refute.called(v.stub);

      setTimeout.yield();

      assert.called(v.stub);
    },

    "test clearTimeout": function () {
      test.stub(isServer ? global : window, 'clearTimeout');

      koru.clearTimeout(1234);

      assert.calledWith(clearTimeout, 1234);
    },
  });
});
