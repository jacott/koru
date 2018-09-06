isServer && define((require, exports, module)=>{
  const koru   = require('./main');
  const TH     = require('./test-helper');
  const util   = require('./util');

  const {stub, spy, onEnd} = TH;

  const Future = requirejs.nodeRequire('fibers/future');

  const sut = require('./pool-server');

  let v = {};
  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.create = cb=>{
        cb(null, v.conn);
      };

      v.destroy = stub();

      stub(global, 'setTimeout').returns(123);
      stub(global, 'clearTimeout');
    });

    afterEach(()=>{
      v = {};
    });

    test("acquire, release", ()=>{
      v.conn = [1];
      const pool = new sut({
        create: v.create,
        destroy: v.destroy,
        max: 2,
      });

      util.withDateNow(util.dateNow(), ()=>{
        const conn1 = pool.acquire();
        assert.same(conn1, v.conn);

        v.conn = [2];

        util.thread.date += 10000;
        const conn2 = pool.acquire();
        assert.same(conn2, v.conn);

        pool.release(conn1);

        assert.same(pool.acquire(), conn1);

        const future = new Future;
        util.Fiber(()=>{
          future.return(pool.acquire());
        }).run();

        pool.release(conn2);
        assert.same(future.wait(), conn2);
      });
    });

    test("destroy", ()=>{
      v.conn = [1];
      const pool = new sut({
        create: v.create,
        destroy: v.destroy,
        max: 2,
      });

      util.withDateNow(util.dateNow(), ()=>{
        const conn1 = pool.acquire();
        assert.same(conn1, v.conn);

        v.conn = [2];

        util.thread.date += 10000;
        const conn2 = pool.acquire();
        assert.same(conn2, v.conn);

        pool.release(conn1);


        assert.calledOnceWith(global.setTimeout, TH.match.func, 30000);

        const tofunc = global.setTimeout.args(0, 0);
        global.setTimeout.reset();

        util.thread.date += 20000;

        tofunc();

        refute.called(v.destroy);
        assert.calledWith(global.setTimeout, tofunc, 10000);

        util.thread.date += 10000;

        tofunc();

        assert.calledWith(v.destroy, conn1);
      });
    });
  });
});
