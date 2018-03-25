define(function (require, exports, module) {
  const TH   = require('./test');

  const {stub, spy, onEnd, intercept} = TH;

  const util  = require('./util');

  let v = null;

  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      v = null;
    },

    "waitCallback": {
      setUp() {
        stub(global, 'setTimeout').returns(123);
        stub(global, 'clearTimeout');
        v.origCallTimeout = util.thread.callTimeout;
        util.thread.callTimeout = undefined;
      },

      tearDown() {
        util.thread.callTimeout = v.origCallTimeout;
      },

      "test callback"() {
        let resolved = false;
        const future = {throw: stub(), return: stub(), isResolved: ()=> resolved};

        const func = util.waitCallback(future);

        assert.calledWith(setTimeout, TH.match.func, 20*1000);
        refute.called(clearTimeout);

        func(v.foo = new Error("foo"));

        assert.calledWith(future.throw, v.foo);
        refute.called(future.return);

        func(null, "message");
        assert.calledWith(future.return, "message");
        assert.calledOnce(future.throw);
        func(123);
        assert.calledWith(future.throw, TH.match(err => err.message === "123"));

        future.throw.reset(); future.return.reset();
        resolved = true;
        func(123);
        refute.called(future.throw);
        refute.called(future.return);
      },

      "test timeout"() {
        util.thread.callTimeout = 10*1000;
        setTimeout.restore();
        const origSetTimeout = setTimeout;
        intercept(global, 'setTimeout', (func, to)=>{
          assert.same(to, 10*1000);
          origSetTimeout(func, 0);
        });

        const future = new util.Future;
        const func = util.waitCallback(future);

        assert.exception(()=>{
          future.wait();
        }, {error: 504, reason: 'Timed out'});

        refute.called(clearTimeout);

        func(123); // no exception
      },
    },

    "test callWait"() {
      const wait = stub().returns("success");
      const future = {wait};
      function myFuture() {return future}
      const method = stub();
      stub(util, "waitCallback").returns("waitCallback-call");
      const myThis = {method};

      intercept(util, 'Future', myFuture);

      assert.same(util.callWait(method, myThis, "foo", 1, 2), "success");

      assert.calledWith(method, "foo", 1, 2, "waitCallback-call");
      assert.same(method.firstCall.thisValue, myThis);

      assert.calledWith(util.waitCallback, future);
      assert.called(wait);
      assert(method.calledBefore(wait));
    },

    "test engine"() {
      assert.same(util.engine, 'Server');
    },
  });
});
