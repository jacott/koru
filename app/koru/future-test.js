define((require, exports, module) => {
  'use strict';
  /**
   * Future is a utility class for waiting and resolving promises.
   */
  const TH              = require('koru/test');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const Future = require('./future');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('construction', async () => {
      const Future = api.class();
      api.property('isResolved', {info: '`true` when promise is resolved'});
      //[
      const future = new Future();
      assert.isFalse(future.isResolved);
      future.resolve(123);
      assert.isTrue(future.isResolved);
      assert.same(await future.promise, 123);
      //]
    });

    test('promiseAndReset', async () => {
      /**
       * After waiting for the promise; reinitialize so it can be waited for again;
       */
      api.protoMethod();
      //[
      const future = new Future();
      future.reject(new Error('reject'));
      await assert.exception(() => future.promiseAndReset(), {message: 'reject'});
      future.resolve(456);
      assert.same(await future.promiseAndReset(), 456);
      assert.isFalse(future.isResolved);
      //]
    });
  });
});
