define((require, exports, module) => {
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
          counter = 1;
          mutex.unlock();
        });
      } finally {
        mutex.unlock();
      }

      await mutex.lock();
      try {
        assert.same(counter, 1);
      } finally {
        mutex.unlock();
      }
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

      await mutex.lock();
      assert.isTrue(mutex.isLocked);
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
      //]
    });

    test('isLocked', async () => {
      const mutex = new Mutex();

      api.protoProperty('isLocked', {info: `true if mutex is locked`});
      assert.isFalse(mutex.isLocked);

      await mutex.lock();

      assert.isTrue(mutex.isLocked);

      mutex.unlock();
      assert.isFalse(mutex.isLocked);
      api.done();
    });

    test('multiple waits', async () => {
      const mutex = new Mutex();

      let ans = [];

      const runInner = (id) => {
        koru.runFiber(async () => {
          await mutex.lock();
          ans.push(id);
          mutex.unlock();
        });
      };

      await mutex.lock();

      runInner(1);
      runInner(2);
      runInner(3);
      assert.equals(ans, []);
      mutex.unlock();

      assert.equals(await ans, [1]);

      await mutex.lock();
      assert.equals(ans, [1, 2, 3]);
    });
  });
});
