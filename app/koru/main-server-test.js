define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./main');
  var util = require('koru/util');

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

    "test fiberWrapper": function () {
      test.stub(util, 'Fiber').returns({run: v.run = test.stub()});

      sut.fiberWrapper(v.stub = test.stub(), v.conn = {}, v.data = [1, 2]);
      assert.called(v.run);
      util.Fiber.args(0, 0)();
      assert.calledWith(v.stub, v.data);

      assert.same(v.stub.firstCall.thisValue, v.conn);

      util.Fiber.reset();
      test.stub(sut, 'error');
      sut.fiberWrapper(function () {throw new Error("Foo")}, v.conn, v.data);
      util.Fiber.args(0, 0)();
      assert.calledWith(sut.error, TH.match(/Foo/));
    },
  });
});
