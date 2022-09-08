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

    test('promise', async () => {
      /**
       * The promise to await for
       */
      api.protoProperty();
      //[
      const future = new Future();
      future.reject(new Error('reject'));

      // we don't have to await a rejection immediately
      await new Promise((resolve) => {setTimeout(resolve, 1)});

      await assert.exception(() => future.promiseAndReset(), {message: 'reject'});

      // resolve after await promiseAndReset
      setTimeout(() => future.resolve(456), 1);
      assert.same(await future.promiseAndReset(), 456);
      assert.isFalse(future.isResolved);

      // reject after await promise
      setTimeout(() => future.reject({message: 'reject2'}), 1);

      assert.isPromise(future.promise);
      assert.same(future.promise, future.promise);
      assert.isFunction(future.resolve);

      await assert.exception(() => future.promise, {message: 'reject2'});

      assert.isTrue(future.isResolved);
      assert.same(future.resolve, undefined);
      assert.same(future.reject, undefined);
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

    test('detached resolve before promise', async () => {
      const future = new Future();
      const {resolve} = future;
      const {promise} = future;

      resolve(123);

      assert.same(await promise, 123);
    });

    test('detached reject before promise', async () => {
      const future = new Future();
      const {reject} = future;
      const {promise} = future;

      reject({message: 123});

      await assert.exception(() => promise, {message: 123});
    });
  });
});
