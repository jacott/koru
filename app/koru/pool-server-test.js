isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./pool-server');
  var koru = require('./main');
  var util = require('./util');
  var Future = requirejs.nodeRequire('fibers/future');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};

      v.create = function (cb) {
        cb(null, v.conn);
      };

      v.destroy = test.stub();

      test.stub(global, 'setTimeout').returns(123);
      test.stub(global, 'clearTimeout');
    },

    tearDown: function () {
      v = null;
    },

    "test acquire, release": function () {
      v.conn = [1];
      var pool = new sut({
        create: v.create,
        destroy: v.destroy,
        max: 2,
      });

      util.withDateNow(util.dateNow(), function () {
        var conn1 = pool.acquire();
        assert.same(conn1, v.conn);

        v.conn = [2];

        util.thread.date += 10000;
        var conn2 = pool.acquire();
        assert.same(conn2, v.conn);

        pool.release(conn1);

        assert.same(pool.acquire(), conn1);

        var future = new Future;
        util.Fiber(function () {
          future.return(pool.acquire());
        }).run();

        pool.release(conn2);
        assert.same(future.wait(), conn2);
      });
    },

    "test destroy": function () {
      v.conn = [1];
      var pool = new sut({
        create: v.create,
        destroy: v.destroy,
        max: 2,
      });

      util.withDateNow(util.dateNow(), function () {
        var conn1 = pool.acquire();
        assert.same(conn1, v.conn);

        v.conn = [2];

        util.thread.date += 10000;
        var conn2 = pool.acquire();
        assert.same(conn2, v.conn);

        pool.release(conn1);


        assert.calledOnceWith(global.setTimeout, TH.match.func, 30000);

        var tofunc = global.setTimeout.args(0, 0);
        global.setTimeout.reset();

        util.thread.date += 20000;

        tofunc();

        refute.called(v.destroy);
        assert.calledWith(global.setTimeout, tofunc, 10000);

        util.thread.date += 10000;

        tofunc();

        assert.calledWith(v.destroy, conn1);
      });
    },
  });
});
