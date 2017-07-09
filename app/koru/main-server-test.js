define(function (require, exports, module) {
  const dbBroker = require('koru/model/db-broker');
  const util     = require('koru/util');
  const TH       = require('./test-helper');

  const koru     = require('./main');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      cleanup();
      v = null;
    },

    "test koru.global"() {
      assert.same(koru.global, global);
    },

    "test afTimeout"() {
      test.stub(koru, 'setTimeout').returns(123);
      var stop = koru._afTimeout(v.stub = test.stub, 1000);

      assert.calledWith(koru.setTimeout, v.stub, 1000);

      test.spy(global, 'clearTimeout');
      stop();
      assert.calledWith(global.clearTimeout, 123);
    },


    "test runFiber"() {
      test.stub(util, 'Fiber').returns({run: v.run = test.stub()});

      koru.runFiber(() => {v.success = true});
      assert.called(v.run);
      util.Fiber.args(0, 0)();
      assert(v.success);

      util.Fiber.reset();
      test.stub(koru, 'error');
      koru.runFiber(()=>{throw new Error("Foo")});
      util.Fiber.args(0, 0)();
      assert.calledWith(koru.error, TH.match(/Foo/));

      /** can't restart fiber **/
      koru.error.reset();
      util.Fiber.args(0, 0)();
      refute.called(koru.error);
    },

    "test fiberConnWrapper"() {
      test.stub(util, 'Fiber').returns({run: v.run = test.stub()});

      koru.fiberConnWrapper((conn, data)=>{
        v.thread = util.merge({This: conn, data: data}, util.thread);
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
      test.stub(koru, 'error');
      koru.fiberConnWrapper(function () {throw new Error("Foo")}, v.conn, v.data);
      util.Fiber.args(0, 0)();
      assert.calledWith(koru.error, TH.match(/Foo/));

      /** can't restart fiber **/
      koru.error.reset();
      util.Fiber.args(0, 0)();
      refute.called(koru.error);
    },
  });

  function cleanup() {
    dbBroker.db = util.thread.connection = util.thread.userId = null;
  }
});
