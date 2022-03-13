isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Mutex implements a semaphore [lock](https://en.wikipedia.org/wiki/Lock_(computer_science)).
   *
   **/
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const Mutex = require('./mutex');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('constructor', async () => {
      /**
       * Construct a Mutex.
       **/
      const Mutex = api.class();

      //[
      const mutex = new Mutex();

      let counter = 0;

      try {
        await mutex.lock();

        koru.runFiber(async () => {
          await mutex.lock();

          assert.isTrue(mutex.isLocked);
          assert.isTrue(mutex.isLockedByMe);

          koru.runFiber(() => {
            assert.isTrue(mutex.isLocked);
            assert.isFalse(mutex.isLockedByMe);
          });

          counter = 1;

          mutex.unlock();

          assert.isTrue(mutex.isLocked);
          assert.isFalse(mutex.isLockedByMe);
        });
      } finally {
        assert.isTrue(mutex.isLocked);
        assert.isTrue(mutex.isLockedByMe);

        mutex.unlock();
      }

      await mutex.lock();
      try {
        assert.same(counter, 1);
      } finally {
        mutex.unlock();
      }

      assert.isFalse(mutex.isLocked);
      assert.isFalse(mutex.isLockedByMe);
      //]
    });

    test('lock', async () => {
      /**
       * Aquire a lock on the mutex. Will pause until the mutex is unlocked
       **/
      api.protoMethod();
      //[
      const mutex = new Mutex();

      assert.isFalse(mutex.isLocked);
      assert.isFalse(mutex.isLockedByMe);

      await mutex.lock();
      assert.isTrue(mutex.isLocked);
      assert.isTrue(mutex.isLockedByMe);
      //]
    });

    test('unlock', async () => {
      /**
       * Release a lock on the mutex. Will allow another fiber to aquire the lock
       **/
      api.protoMethod();
      //[
      const mutex = new Mutex();
      await mutex.lock();
      assert.isTrue(mutex.isLocked);

      mutex.unlock();
      assert.isFalse(mutex.isLocked);
      assert.isFalse(mutex.isLockedByMe);
      //]
    });

    test('isLocked', async () => {
      api.protoProperty('isLocked', {info: `true if mutex is locked`});
      //[
      const mutex = new Mutex();
      assert.isFalse(mutex.isLocked);

      await mutex.lock();

      assert.isTrue(mutex.isLocked);

      mutex.unlock();
      assert.isFalse(mutex.isLocked);
      //]
    });

    test('isLockedByMe', async () => {
      api.protoProperty('isLockedByMe', {info: `true if mutex is locked by the current thread`});
      //[
      const mutex = new Mutex();

      let ans = [];

      const runInner = (id) => {
        koru.runFiber(async () => {
          await mutex.lock();
          assert.isTrue(mutex.isLockedByMe);
          koru.runFiber(() => {
            assert.isFalse(mutex.isLockedByMe);
          });

          ans.push(id);
          mutex.unlock();
          assert.isFalse(mutex.isLockedByMe);
        });
      };

      await mutex.lock();
      assert.isTrue(mutex.isLockedByMe);
      await mutex.lock();

      runInner(1);
      runInner(2);
      runInner(3);
      assert.equals(ans, []);
      assert.isTrue(mutex.isLockedByMe);
      mutex.unlock();
      assert.isFalse(mutex.isLockedByMe);

      assert.equals(await ans, [1]);

      await mutex.lock();
      assert.equals(ans, [1, 2, 3]);
      //]
    });
  });
});
