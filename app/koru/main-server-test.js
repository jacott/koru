define(function (require, exports, module) {
  var test, v;
  const dbBroker = require('koru/model/db-broker');
  const util     = require('koru/util');
  const sut      = require('./main');
  const TH       = require('./test-helper');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      cleanup();
      v = null;
    },

    "test afTimeout"() {
      test.stub(sut, 'setTimeout').returns(123);
      var stop = sut._afTimeout(v.stub = test.stub, 1000);

      assert.calledWith(sut.setTimeout, v.stub, 1000);

      test.spy(global, 'clearTimeout');
      stop();
      assert.calledWith(global.clearTimeout, 123);
    },

    "test fiberWrapper"() {
      cleanup();
      test.stub(util, 'Fiber').returns({run: v.run = test.stub()});

      sut.fiberConnWrapper(function (conn, data) {
        v.thread = util.extend({This: conn, data: data}, util.thread);
      }, v.conn = {userId: 'u123', db: v.mydb = {id: "mydb"}}, v.data = [1, 2]);
      assert.called(v.run);
      util.Fiber.args(0, 0)();
      assert(v.thread);

      assert.equals(v.thread.userId, "u123");
      assert.same(v.thread.db, v.mydb);
      assert.same(v.thread.connection, v.conn);
      assert.same(v.thread.This, v.conn);
      assert.same(v.thread.data, v.data);

      util.Fiber.reset();
      test.stub(sut, 'error');
      sut.fiberConnWrapper(function () {throw new Error("Foo")}, v.conn, v.data);
      util.Fiber.args(0, 0)();
      assert.calledWith(sut.error, TH.match(/Foo/));
    },
  });

  function cleanup() {
    dbBroker.db = util.thread.connection = util.thread.userId = null;
  }
});
