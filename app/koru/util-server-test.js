define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, intercept} = TH;

  const util = require('./util');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      api.module({subjectModule: module.get('./util'), subjectName: 'util'});
    });

    test('thread', () => {
      /**
       * An object associated with the current [Fiber](https://www.npmjs.com/package/fibers).
       **/
      api.property();
      assert.same(util.thread, util.thread);
      let other;
      util.Fiber(() => {other = util.thread}).run();
      refute.same(util.thread, other);
      assert.equals(util.thread, TH.match.baseObject);
      assert.equals(other, TH.match.baseObject);
    });

    group('waitCallback', () => {
      let origCallTimeout;
      beforeEach(() => {
        stub(global, 'setTimeout').returns(123);
        stub(global, 'clearTimeout');
        origCallTimeout = util.thread.callTimeout;
        util.thread.callTimeout = undefined;
      });

      afterEach(() => {
        util.thread.callTimeout = origCallTimeout;
        origCallTimeout = null;
      });

      test('callback', () => {
        let resolved = false;
        const future = {throw: stub(), return: stub(), isResolved: () => resolved};

        const func = util.waitCallback(future);

        assert.calledWith(setTimeout, TH.match.func, 20*1000);
        refute.called(clearTimeout);

        const err = new Error('foo');
        func(err);

        assert.calledWith(future.throw, err);
        refute.called(future.return);
        future.throw.reset();

        func(null, 'message');
        assert.calledOnceWith(future.return, [null, 'message']);
        refute.called(future.throw);
        future.return.reset();
        func(123);
        assert.calledWith(future.return, [{error: 500, reason: '123'}]);

        future.throw.reset(); future.return.reset();
        resolved = true;
        func(123);
        refute.called(future.throw);
        refute.called(future.return);
      });

      test('timeout', () => {
        util.thread.callTimeout = 10*1000;
        setTimeout.restore();
        const origSetTimeout = setTimeout;
        intercept(global, 'setTimeout', (func, to) => {
          assert.same(to, 10*1000);
          origSetTimeout(func, 0);
        });

        const future = new util.Future();
        const func = util.waitCallback(future);

        assert.equals(future.wait(), [{error: 504, reason: 'Timed out'}]);

        refute.called(clearTimeout);

        assert.same(func(123), void 0);
      });
    });

    test('callWait success', () => {
      const wait = stub().returns([null, 'success']);
      const future = {wait};
      function myFuture() {return future}
      const method = stub();
      stub(util, 'waitCallback').returns('waitCallback-call');
      const myThis = {method};

      intercept(util, 'Future', myFuture);

      assert.same(util.callWait(method, myThis, 'foo', 1, 2), 'success');

      assert.calledWith(method, 'foo', 1, 2, 'waitCallback-call');
      assert.same(method.firstCall.thisValue, myThis);

      assert.calledWith(util.waitCallback, future);
      assert.called(wait);
      assert(method.calledBefore(wait));
    });

    test('callWait error', () => {
      const wait = stub().returns([{error: 400, reason: 'is_invalid'}]);
      const future = {wait};
      function myFuture() {return future}
      const method = stub();
      stub(util, 'waitCallback').returns('waitCallback-call');
      const myThis = {method};

      intercept(util, 'Future', myFuture);

      assert.exception(() => {
        util.callWait(method, myThis, 'foo', 1, 2);
      }, {error: 400, reason: 'is_invalid'});
    });

    test('engine', () => {
      assert.same(util.engine, 'Server');
    });
  });
});
