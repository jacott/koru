define((require, exports, module)=>{
  const dbBroker = require('koru/model/db-broker');
  const util     = require('koru/util');
  const TH       = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const koru     = require('./main');
  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      cleanup();
      v = {};
    });

    test("koru.global", ()=>{
      assert.same(koru.global, global);
    });

    test("afTimeout", ()=>{
      stub(koru, 'setTimeout').returns(123);
      var stop = koru._afTimeout(v.stub = stub(), 1000);

      assert.calledWith(koru.setTimeout, v.stub, 1000);

      spy(global, 'clearTimeout');
      stop();
      assert.calledWith(global.clearTimeout, 123);
    });


    test("runFiber", ()=>{
      stub(util, 'Fiber').returns({run: v.run = stub()});

      koru.runFiber(() => {v.success = true});
      assert.called(v.run);
      util.Fiber.args(0, 0)();
      assert(v.success);

      util.Fiber.reset();
      stub(koru, 'error');
      koru.runFiber(()=>{throw new Error("Foo")});
      util.Fiber.args(0, 0)();
      assert.calledWith(koru.error, TH.match(/Foo/));

      /** can't restart fiber **/
      koru.error.reset();
      util.Fiber.args(0, 0)();
      refute.called(koru.error);
    });

    test("fiberConnWrapper", ()=>{
      stub(util, 'Fiber').returns({run: v.run = stub()});

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
      stub(koru, 'error');
      koru.fiberConnWrapper(()=>{throw new Error("Foo")}, v.conn, v.data);
      util.Fiber.args(0, 0)();
      assert.calledWith(koru.error, TH.match(/Foo/));

      /** can't restart fiber **/
      koru.error.reset();
      util.Fiber.args(0, 0)();
      refute.called(koru.error);
    });
  });

  const cleanup = ()=>{
    dbBroker.db = util.thread.connection = util.thread.userId = null;
  };
});
