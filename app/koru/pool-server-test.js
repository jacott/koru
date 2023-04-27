define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const koru            = require('./main');
  const TH              = require('./test-helper');
  const util            = require('./util');

  const {stub, spy, intercept, match: m} = TH;

  const PoolServer = require('./pool-server');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    let create, conn, destroy;
    beforeEach(() => {
      create = (cb) => {cb(null, conn)};
      destroy = stub();

      stub(global, 'setTimeout').returns(123);
      stub(global, 'clearTimeout');
    });

    test('acquire, release', async () => {
      conn = [1];
      const pool = new PoolServer({
        create,
        destroy,
        max: 2,
      });

      let now = Date.now();
      try {
        intercept(Date, 'now', () => now);

        const conn1 = await pool.acquire();
        assert.same(conn1, conn);

        conn = [2];

        util.thread.date += 10000;
        const conn2 = await pool.acquire();
        assert.same(conn2, conn);

        pool.release(conn1);

        assert.same(pool.acquire(), conn1);

        const future = new Future();
        koru.runFiber(() => {
          future.resolve(pool.acquire());
        });

        pool.release(conn2);
        assert.same(await future.promise, conn2);
      } finally {
        Date.now.restore();
        util.thread.date = undefined;
      }
    });

    test('connectionCount', async () => {
      const pool = new PoolServer({
        create,
        destroy,
        max: 2,
      });

      assert.same(pool.connectionCount, 0);
      await pool.acquire();
      assert.same(pool.connectionCount, 1);
      await pool.acquire();
      assert.same(pool.connectionCount, 2);
      pool.drain();
      assert.same(pool.connectionCount, 0);
    });

    test('destroy', async () => {
      conn = [1];
      const pool = new PoolServer({
        create,
        destroy,
        max: 2,
      });

      let now = Date.now();
      try {
        intercept(Date, 'now', () => now);
        const conn1 = await pool.acquire();
        assert.same(conn1, conn);

        conn = [2];

        now += 10000;

        refute.called(global.setTimeout);

        const conn2 = await pool.acquire();
        assert.same(conn2, conn);

        pool.release(conn1);

        assert.calledOnceWith(global.setTimeout, m.func, 30000);

        const tofunc = global.setTimeout.args(0, 0);
        global.setTimeout.reset();

        now += 20000;

        tofunc();

        refute.called(destroy);
        assert.calledWith(global.setTimeout, tofunc, 10000);

        now += 10000;

        tofunc();

        assert.calledWith(destroy, conn1);
      } finally {
        Date.now.restore();
      }
    });
  });
});
