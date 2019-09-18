define((require, exports, module)=>{
  'use strict';
  const dbBroker        = require('koru/model/db-broker');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, match: m, intercept} = TH;

  const koru     = require('./main');
  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      cleanup();
      v = {};
    });

    group("afTimeout", ()=>{
      test("lt 24 DAYS", ()=>{
        const cb = stub();
        stub(koru, 'setTimeout').returns(123);
        const stop = koru._afTimeout(cb, 1000);

        assert.calledWith(koru.setTimeout, cb, 1000);

        spy(global, 'clearTimeout');
        stop();
        assert.calledWith(global.clearTimeout, 123);
      });

      test("cancel gt 24 days", ()=>{
        const cb = stub();
        let handle = 100;
        const incCounter = ()=> ++handle;
        stub(koru, 'setTimeout').invokes(incCounter);
        stub(global, 'setTimeout').invokes(incCounter);
        stub(global, 'clearTimeout');
        let now = Date.now(); intercept(Date, 'now', ()=>now);

        const stop = koru._afTimeout(cb, 45*util.DAY);

        assert.calledWith(global.setTimeout, m.func, 20*util.DAY);
        global.setTimeout.yieldAndReset();

        stop();

        assert.calledWith(global.clearTimeout, 102);
      });

      test("gt 24 days", ()=>{
        const cb = stub();
        let handle = 100;
        const incCounter = ()=> ++handle;
        stub(koru, 'setTimeout').invokes(incCounter);
        stub(global, 'setTimeout').invokes(incCounter);
        stub(global, 'clearTimeout');
        let now = Date.now(); intercept(Date, 'now', ()=>now);

        const stop = koru._afTimeout(cb, 45*util.DAY);

        assert.calledWith(global.setTimeout, m.func, 20*util.DAY);
        now+=20*util.DAY;
        global.setTimeout.yieldAndReset();

        assert.calledWith(global.setTimeout, m.func, 20*util.DAY);
        now+=21*util.DAY;
        refute.called(koru.setTimeout);
        global.setTimeout.yieldAndReset();

        assert.calledOnceWith(koru.setTimeout, m.func, 4*util.DAY);
        assert.same(koru.setTimeout.firstCall.returnValue, 103);

        stop();

        assert.calledOnceWith(global.clearTimeout, 103);
        refute.called(cb);
        koru.setTimeout.yieldAndReset();
        assert.called(cb);

        stop(); // stop is idempotent
        assert.calledOnce(global.clearTimeout);
      });
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
    dbBroker.db = util.thread.connection = util.thread.userId = void 0;
  };
});
