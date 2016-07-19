define(function (require, exports, module) {
  var test, v;
  const koru = require('./main');
  const TH   = require('./test-helper');
  const util = require('./util');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test setTimeout"() {
      test.stub(isServer ? global : window, 'setTimeout').returns(123);
      test.stub(util, 'Fiber').returns({run() {
        util.Fiber.lastCall.args[0]();
      }});

      var token = koru.setTimeout(v.stub = test.stub(), 123000);

      assert.calledWith(setTimeout, TH.match.func, 123000);

      assert.same(token, setTimeout.firstCall.returnValue);

      if (isServer) assert.calledWith(util.Fiber, TH.match.func);

      refute.called(v.stub);

      setTimeout.yield();

      assert.called(v.stub);
    },

    "test clearTimeout"() {
      test.stub(isServer ? global : window, 'clearTimeout');

      koru.clearTimeout(1234);

      assert.calledWith(clearTimeout, 1234);
    },
  });
});
