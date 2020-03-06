isServer && define((require, exports, module)=>{
  'use strict';
  /**
   * IdleCheck keeps count of usage and notifies when idle.
   *
   **/
  const koru            = require('koru');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy} = TH;
  const {Fiber} = util;

  const IdleCheck = require('./idle-check');

  let v = {};
  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      v = {};
    });

    test("singleton", ()=>{
      /**
       * The default `IdleCheck`. It is used by
       * {#koru/web-server-factory} and
       * {#koru/session/server-connection-factory}
       **/
      api.property('singleton');
      assert.same(IdleCheck.singleton, IdleCheck.singleton);
      assert(IdleCheck.singleton instanceof IdleCheck);
    });

    test("constructor", ()=>{
      const IdleCheck = api.class();
      assert(new IdleCheck() instanceof IdleCheck);
    });

    group("fiber timeout", ()=>{
      beforeEach(()=>{
        v.idleCheck = new IdleCheck();
        v.idleCheck.maxTime = 1*60*1000;
        stub(global, 'setTimeout').returns(112233);
        stub(global, 'clearTimeout');
        v.f2 = Fiber(() => {
          v.idleCheck.inc();
          try {
            Fiber.yield();
          } catch(ex) {
            v.ex = ex;
          }
          v.idleCheck.dec();
        });

        v.f2.appThread = {dbId: 'foo1', userId: 'u123'};

        v.f2.run();
      });

      test("running too long", ()=>{
        stub(console, 'error');

        assert.calledWith(global.setTimeout, TH.match(f => v.func = f), 1*60*1000);

        v.func();

        assert.equals(v.ex.message, 'Thread timeout [504]');
        assert.calledWith(console.error, 'aborted; timed out. dbId: foo1, userId: u123');
      });

      test("finish in time", ()=>{
        assert.calledWith(global.setTimeout, TH.match(f => v.func = f), 1*60*1000);

        refute.called(global.clearTimeout);

        v.f2.run();

        refute(v.ex);

        assert.calledWith(global.clearTimeout, 112233);
      });
    });

    group("waitIdle", ()=>{
      test("already Idle", ()=>{
        /**
         * waitIdle waits until `this.count` drops to zero.
         **/
        api.protoMethod('waitIdle');
        //[
        const check = new IdleCheck();
        check.waitIdle(v.stub = stub());
        assert.called(v.stub);
        //]
      });

      test("multiple listeners", ()=>{
        const start = Date.now();
        v.idleCheck = new IdleCheck();
        v.idleCheck.onDec = stub();
        v.idleCheck.inc();
        const f2 = Fiber(() => {
          v.idleCheck.inc();
          Fiber.yield();
          v.idleCheck.dec();
        });

        f2.run();

        const cStart = v.idleCheck.fibers.get(Fiber.current);
        const f2Start = v.idleCheck.fibers.get(f2);

        assert.between(cStart, start, Date.now());
        assert.between(f2Start, start, Date.now());

        v.idleCheck.waitIdle(v.stub1 = stub());
        v.idleCheck.waitIdle(v.stub2 = stub());

        v.idleCheck.dec();

        refute(v.idleCheck.fibers.get(Fiber.current));

        refute.called(v.stub1);
        refute.called(v.stub2);
        f2.run();

        assert.equals(Array.from(v.idleCheck.fibers.values()), []);

        assert.called(v.stub1);
        assert.called(v.stub2);

        v.idleCheck.inc();

        v.idleCheck.waitIdle(v.stub3 = stub());
        v.idleCheck.dec();

        assert.calledOnce(v.stub1);
        assert.calledOnce(v.stub3);

        assert.calledWith(v.idleCheck.onDec, Fiber.current, cStart);
        assert.calledWith(v.idleCheck.onDec, f2, f2Start);
      });
    });

    group("exitProcessWhenIdle", ()=>{
      beforeEach(()=>{
        stub(process, 'exit');
        stub(global, 'setTimeout');
        v.idleCheck = new IdleCheck();
        v.f2 = Fiber(() => {
          if (! (v && v.idleCheck)) return;
          v.idleCheck.inc();
          try {
            Fiber.yield();
          } catch(ex) {
            v.ex = ex;
          }
          v.idleCheck && v.idleCheck.dec();
        });
        stub(console, 'log');
      });

      afterEach(()=>{
        v.idleCheck = null;
        v.f2.run();
      });


      test("idle", ()=>{
        v.idleCheck.exitProcessWhenIdle({forceAfter: 20*1000, abortTxAfter: 10*1000});
        assert.called(process.exit);
        assert.calledWith(console.log, '=> Shutdown');
      });

      test("forceAfter", ()=>{
        v.f2.run();
        v.idleCheck.exitProcessWhenIdle({forceAfter: 20*1000});

        assert.calledWith(global.setTimeout, TH.match(f => v.force = f), 20*1000);
        assert.calledWith(global.setTimeout, TH.match.func, 10*1000);

        refute.called(process.exit);
        v.force();
        assert.called(process.exit);
      });

      test("abortTxAfter", ()=>{
        v.f2.run();
        v.idleCheck.exitProcessWhenIdle({abortTxAfter: 10*1000});

        assert.calledWith(global.setTimeout, TH.match.func, 20*1000);
        assert.calledWith(global.setTimeout, TH.match(f => v.abort = f), 10*1000);

        refute.called(process.exit);

        v.abort();

        assert.equals(v.ex.message, 'This Fiber is a zombie');

        assert.called(process.exit);
      });
    });
  });
});
