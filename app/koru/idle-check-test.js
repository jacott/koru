isServer && define((require, exports, module) => {
  'use strict';
  /**
   * IdleCheck keeps count of usage and notifies when idle.
   *
   **/
  const koru            = require('koru');
  const Future          = require('koru/future');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy, match: m} = TH;

  const IdleCheck = require('./idle-check');

  const sleep = (n) => new Promise((resolve, reject) => {
    setTimeout(resolve, n);
  });

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    test('singleton', () => {
      /**
       * The default `IdleCheck`. It is used by
       * {#koru/web-server-factory} and
       * {#koru/session/server-connection-factory}
       **/
      api.property('singleton');
      assert.same(IdleCheck.singleton, IdleCheck.singleton);
      assert(IdleCheck.singleton instanceof IdleCheck);
    });

    test('constructor', () => {
      const IdleCheck = api.class();
      assert(new IdleCheck() instanceof IdleCheck);
    });

    group('fiber timeout', () => {
      let idleCheck, f2, err;
      beforeEach(() => {
        idleCheck = new IdleCheck();
        idleCheck.maxTime = 1*60*1000;
        idleCheck.alertTime = 500;
        stub(global, 'setTimeout').returns(112233);
        stub(global, 'clearTimeout');
        err = void 0;
        f2 = (future) => {
          let thread;
          koru.runFiber(async () => {
            thread = util.thread;
            thread.action = 'testAction';
            idleCheck.inc();
            idleCheck.info.abort = (err) => {future.reject(err)};
            try {
              await future.promise;
            } catch (_err) {
              err = _err;
            }
            idleCheck.dec();
          });
          return thread;
        };
      });

      test('running too long', async () => {
        const future = new Future();
        const thread = f2(future);
        Object.assign(thread, {dbId: 'foo1', userId: 'u123'});

        stub(console, 'error');
        stub(idleCheck, 'dec');

        let func;
        assert.calledOnceWith(global.setTimeout, m((f) => func = f), 500);

        func();

        await 1;

        assert.same(err, void 0);
        assert.calledWith(console.error, 'long running. dbId: foo1, userId: u123 testAction');

        assert.calledWith(global.setTimeout, func, 1*60*1000);

        func();

        refute.called(idleCheck.dec);

        await 1;

        assert.equals(err, 'timeout');
        assert.calledWith(console.error, 'ABORTED; timed out. dbId: foo1, userId: u123 testAction');

        assert.called(idleCheck.dec);
      });

      test('finish in time', async () => {
        idleCheck.alertTime = null;
        const future = new Future();
        const thread = f2(future);

        await 1;

        assert.calledWith(global.setTimeout, m.func, 1*60*1000);

        refute.called(global.clearTimeout);

        future.resolve(); await 1;

        refute(err);

        assert.calledWith(global.clearTimeout, 112233);
      });
    });

    group('waitIdle', () => {
      test('already Idle', () => {
        /**
         * waitIdle waits until `this.count` drops to zero.
         **/
        api.protoMethod('waitIdle');
        //[
        const check = new IdleCheck();
        const callback = stub();
        check.waitIdle(callback);
        assert.called(callback);
        //]
      });

      test('multiple listeners', async () => {
        const start = Date.now();
        const idleCheck = new IdleCheck();
        idleCheck.onDec = stub();
        idleCheck.inc();
        await sleep(1);
        const future = new Future();
        let f2;
        koru.runFiber(async () => {
          f2 = util.thread;
          idleCheck.inc();
          await future.promise;
          idleCheck.dec();
        });

        const cStart = idleCheck.info.start;
        const f2Start = idleCheck.threads.get(f2).start;

        assert.between(cStart, start, Date.now());
        assert.between(f2Start, start, Date.now());

        const cb1 = stub();
        idleCheck.waitIdle(cb1);
        const cb2 = stub();
        idleCheck.waitIdle(cb2);

        idleCheck.dec();

        refute(idleCheck.info);

        refute.called(cb1);
        refute.called(cb2);

        future.resolve(); await 1;

        assert.equals(Array.from(idleCheck.threads.values()), []);

        assert.called(cb1);
        assert.called(cb2);

        idleCheck.inc();

        const {info} = idleCheck;

        const cb3 = stub();
        idleCheck.waitIdle(cb3);
        idleCheck.dec();

        assert.calledOnce(cb1);
        assert.calledOnce(cb3);

        assert.calledWith(idleCheck.onDec, util.thread, cStart);
        assert.calledWith(idleCheck.onDec, f2, f2Start);
      });
    });

    group('exitProcessWhenIdle', () => {
      let idleCheck, f2, future, finished, err;

      const startF2 = () => {
        koru.runFiber(async () => {
          f2 = util.thread;
          idleCheck.inc();
          idleCheck.info.abort = (err) => {
            future.reject(err);
            future = void 0;
          };
          try {
            await future.promise;
          } catch (_err) {
            err = _err;
          } finally {
            try {
              idleCheck?.dec();
              finished.resolve();
            } catch (err) {
              koru.unhandledException(err);
              finished.reject(err);
            }
          }
        });
      };

      beforeEach(() => {
        stub(process, 'exit');
        stub(global, 'setTimeout');
        idleCheck = new IdleCheck();
        future = new Future();
        finished = new Future();
        stub(console, 'log');
      });

      afterEach(() => {
        idleCheck = null;
      });

      test('idle', () => {
        idleCheck.exitProcessWhenIdle({forceAfter: 20*1000, abortTxAfter: 10*1000});
        assert.called(process.exit);
        assert.calledWith(console.log, '=> Shutdown');
      });

      test('forceAfter', async () => {
        startF2();
        idleCheck.exitProcessWhenIdle({forceAfter: 20*1000});

        let force;

        assert.calledWith(global.setTimeout, m((f) => force = f), 20*1000);
        assert.calledWith(global.setTimeout, m.func, 10*1000);

        refute.called(process.exit);
        force();
        assert.called(process.exit);

        future?.resolve();
        await finished.promise;
      });

      test('abortTxAfter', async () => {
        startF2();
        idleCheck.exitProcessWhenIdle({abortTxAfter: 10*1000});

        assert.calledWith(global.setTimeout, m.func, 20*1000);
        let abort;
        assert.calledWith(global.setTimeout, m((f) => abort = f), 10*1000);

        refute.called(process.exit);

        abort();

        await 1;

        assert.equals(err.message, 'Aborted');

        assert.called(process.exit);

        future?.resolve();
        await finished.promise;
      });
    });
  });
});
