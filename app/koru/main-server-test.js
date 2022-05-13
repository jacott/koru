define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const dbBroker        = require('koru/model/db-broker');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy, match: m, intercept} = TH;

  const koru = require('./main');

  const cleanup = () => {
    dbBroker.db = util.thread.connection = util.thread.userId = void 0;
  };

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      cleanup();
    });

    group('afTimeout', () => {
      test('lt 24 DAYS', () => {
        const cb = stub();
        stub(koru, 'setTimeout').returns(123);
        const stop = koru._afTimeout(cb, 1000);

        assert.calledWith(koru.setTimeout, cb, 1000);

        spy(global, 'clearTimeout');
        stop();
        assert.calledWith(global.clearTimeout, 123);
      });

      test('cancel gt 24 days', () => {
        const cb = stub();
        let handle = 100;
        const incCounter = () => ++handle;
        stub(koru, 'setTimeout').invokes(incCounter);
        stub(global, 'setTimeout').invokes(incCounter);
        stub(global, 'clearTimeout');
        let now = Date.now(); intercept(Date, 'now', () => now);

        const stop = koru._afTimeout(cb, 45 * util.DAY);

        assert.calledWith(global.setTimeout, m.func, 20 * util.DAY);
        global.setTimeout.yieldAndReset();

        stop();

        assert.calledWith(global.clearTimeout, 102);
      });

      test('gt 24 days', () => {
        const cb = stub();
        let handle = 100;
        const incCounter = () => ++handle;
        stub(koru, 'setTimeout').invokes(incCounter);
        stub(global, 'setTimeout').invokes(incCounter);
        stub(global, 'clearTimeout');
        let now = Date.now(); intercept(Date, 'now', () => now);

        const stop = koru._afTimeout(cb, 45 * util.DAY);

        assert.calledWith(global.setTimeout, m.func, 20 * util.DAY);
        now += 20 * util.DAY;
        global.setTimeout.yieldAndReset();

        assert.calledWith(global.setTimeout, m.func, 20 * util.DAY);
        now += 21 * util.DAY;
        refute.called(koru.setTimeout);
        global.setTimeout.yieldAndReset();

        assert.calledOnceWith(koru.setTimeout, m.func, 4 * util.DAY);
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

    test('runFiber', async () => {
      stub(koru, 'unhandledException');
      let innerThread;
      let future = new Future();
      const prog = async () => {
        await future.promise;
        return innerThread = util.thread;
      };
      const ans = koru.runFiber(prog);
      assert.same(innerThread, void 0);

      future.resolve();
      await 1;
      assert.equals(innerThread, {});
      refute.same(util.thread, innerThread);
      assert.same(await ans, innerThread);

      future = new Future();

      koru.runFiber(prog);
      await 1;

      refute.called(koru.unhandledException);
      future.reject('reject');

      await 1; await 2;
      assert.calledWith(koru.unhandledException, 'reject');
    });

    test('fiberConnWrapper', async () => {
      stub(koru, 'unhandledException');
      let innerThread;
      let future = new Future();

      const mydb = {id: 'mydb'};
      const conn = {userId: 'u123', db: mydb};
      const data = [1, 2];

      const prog = async (conn, data) => {
        await future.promise;
        return innerThread = Object.assign(util.thread, {args: {conn, data}});
      };

      koru.fiberConnWrapper(prog, conn, data);

      future.resolve();
      await 1;

      assert.equals(innerThread, {
        userId: 'u123', connection: conn, db: mydb, dbId: void 0,
        args: {conn, data}});

      refute.same(innerThread, util.thread);

      future = new Future();

      koru.runFiber(prog);
      await 1;

      refute.called(koru.unhandledException);
      future.reject('reject');

      await 1; await 2;
      assert.calledWith(koru.unhandledException, 'reject');
    });
  });
});
