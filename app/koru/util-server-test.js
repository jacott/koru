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
       */
      api.property();
      assert.same(util.thread, util.thread);
      let other;
      globalThis.__koruThreadLocal.run({}, () => {
        other = util.thread;
      });
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

        assert.calledWith(setTimeout, TH.match.func, 20 * 1000);
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

        future.reject.reset();
        future.resolve.reset();
        future.isResolved = true;
        func(123);
        refute.called(future.reject);
        refute.called(future.resolve);
      });

      test('timeout', () => {
        util.thread.callTimeout = 10 * 1000;
        setTimeout.restore();
        stub(global, 'setTimeout', (func, to) => {
          assert.same(to, 10 * 1000);
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

    group('Modern Chromium Headers (Sec-CH-UA)', () => {
      test('parse Google Chrome from structured hints', () => {
        const mockHeaders = {
          'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not=A?Brand";v="24"',
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36... (Reduced UA)',
        };

        assert.equals(util.browserVersion(mockHeaders), 'Google Chrome-143');
      });

      test('fall back to Chromium if no specific brand is present', () => {
        const mockHeaders = {'sec-ch-ua': '"Chromium";v="143", "Not=A?Brand";v="24"'};

        assert.equals(util.browserVersion(mockHeaders), 'Chromium-143');
      });
    });

    group('Legacy String Fallbacks (Safari / Firefox)', () => {
      test('extract Firefox details from the User-Agent string', () => {
        const mockHeaders = {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
        };

        assert.equals(util.browserVersion(mockHeaders), 'Firefox-140.0');
      });

      test('isolate Safari version details', () => {
        const mockHeaders = {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
        };

        assert.equals(util.browserVersion(mockHeaders), 'Safari-18.2');
      });

      test('handle empty header inputs gracefully', () => {
        assert.equals(util.browserVersion({}), 'Unknown-Unknown');
      });
    });
  });
});
