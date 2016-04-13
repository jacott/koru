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
      cleanup();
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
      cleanup();
      test.stub(util, 'Fiber').returns({run: v.run = test.stub()});

      sut.fiberWrapper(function (data) {
        v.thread = util.extend({This: this, data: data}, util.thread);
      }, v.conn = {userId: 'u123', db: "mydb"}, v.data = [1, 2]);
      assert.called(v.run);
      util.Fiber.args(0, 0)();
      assert(v.thread);

      assert.equals(v.thread.userId, "u123");
      assert.equals(v.thread.db, "mydb");
      assert.same(v.thread.connection, v.conn);
      assert.same(v.thread.This, v.conn);
      assert.same(v.thread.data, v.data);

      util.Fiber.reset();
      test.stub(sut, 'error');
      sut.fiberWrapper(function () {throw new Error("Foo")}, v.conn, v.data);
      util.Fiber.args(0, 0)();
      assert.calledWith(sut.error, TH.match(/Foo/));
    },
  });

  function cleanup() {
    util.thread.db = util.thread.connection = util.thread.userId = null;
  }
});
