define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, intercept, stubProperty, match: m} = TH;

  const util = require('./util');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      api.module({subjectModule: module.get('./util'), subjectName: 'util'});
    });

    test('thread', () => {
      /**
       * An object associated with the current
       * [AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage).
       **/
      api.property();
      assert.same(util.thread, util.thread);
      let other;
      globalThis.__koruThreadLocal.run({}, () => {other = util.thread});
      refute.same(util.thread, other);
      assert.equals(util.thread.finally, m.func);
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
        const future = {reject: stub(), resolve: stub(), isResolved: false};

        const func = util.waitCallback(future);

        assert.calledWith(setTimeout, TH.match.func, 20*1000);
        refute.called(clearTimeout);

        const err = new Error('foo');
        func(err);

        assert.calledWith(future.reject, err);
        refute.called(future.resolve);
        future.reject.reset();

        func(null, 'message');
        assert.calledOnceWith(future.resolve, [null, 'message']);
        refute.called(future.reject);
        future.resolve.reset();
        func(123);
        assert.calledWith(future.resolve, [{error: 500, reason: '123'}]);

        future.reject.reset(); future.resolve.reset();
        future.isResolved = true;
        func(123);
        refute.called(future.reject);
        refute.called(future.resolve);
      });

      test('timeout', () => {
        util.thread.callTimeout = 10*1000;
        setTimeout.restore();
        stub(global, 'setTimeout', (func, to) => {
          assert.same(to, 10*1000);
        });

        const future = {reject: stub(), resolve: stub(), isResolved: false};
        const func = util.waitCallback(future);

        global.setTimeout.yieldAndReset();

        assert.calledWith(future.resolve, [{error: 504, reason: 'Timed out'}]);

        assert.same(func(123), void 0);
        refute.called(clearTimeout);
      });
    });

    group('callWait success', () => {
      let myMethod;
      const myThis = {myThis: 123};
      let ans, callback;
      beforeEach(() => {
        myMethod = stub();
        ans = util.callWait(myMethod, myThis, 'foo', 1, 2);

        assert.calledOnceWith(myMethod, 'foo', 1, 2, m((cb) => callback = cb));
        assert.same(myMethod.firstCall.thisValue, myThis);
      });

      test('success', async () => {
        callback(void 0, 'success');

        assert.same(await ans, 'success');
      });

      test('error', async () => {
        const error = new Error('test');
        callback(error);
        try {
          await ans;
          assert.fail('exptected throw');
        } catch (err) {
          assert.same(error, err);
        }
      });
    });

    test('engine', () => {
      assert.same(util.engine, 'Server');
    });
  });
});
