isServer && define((require, exports, module)=>{
  /**
   * Mutex implements a semaphore [lock](https://en.wikipedia.org/wiki/Lock_(computer_science)). It
   * works by yielding the current

   * [Fiber thread](https://github.com/laverdet/node-fibers#api-documentation), if the mutex is
   * locked, and resuming the thread when the mutex is unlocked.
   *
   **/
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const Fiber           = requirejs.nodeRequire('fibers');

  const {stub, spy, onEnd, util} = TH;

  const Mutex = require('./mutex');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("constructor", ()=>{
      /**
       * Construct a Mutex.
       **/
      const Mutex = api.class();

      //[
      const mutex = new Mutex();

      let counter = 0;

      try {
        mutex.lock();
        koru.runFiber(()=>{
          mutex.lock();
          ++counter;
          mutex.unlock();
        });
        assert.same(counter, 0);
      } finally {
        mutex.unlock();
      }
      assert.same(counter, 1);

      mutex.lock();
      try {
        assert.same(counter, 1);
      } finally {
        mutex.unlock();
      }
      //]
    });

    test("lock", ()=>{
      /**
       * Aquire a lock on the mutex. Will pause until the mutex is unlocked
       **/
      api.protoMethod();
      //[
      const mutex = new Mutex;

      assert.isFalse(mutex.isLocked);

      mutex.lock();
      assert.isTrue(mutex.isLocked);
      //]
    });

    test("unlock", ()=>{
      /**
       * Release a lock on the mutex. Will allow another fiber to aquire the lock
       **/
      api.protoMethod();
      //[
      const mutex = new Mutex;
      mutex.lock();
      assert.isTrue(mutex.isLocked);

      mutex.unlock();
      assert.isFalse(mutex.isLocked);
      //]
    });

    test("sequencing", ()=>{
      const mutex = new Mutex;

      mutex.lock();
      mutex.unlock();
      api.done();

      let ex;
      let counter = 0;

      const runInner = (cb) =>{
        koru.runFiber(()=>{
          if (ex !== void 0) return;
          try {
            mutex.lock();
            cb();
            ++counter;
          } catch (e) {
            if (ex === void 0); {
              ex = e;
            }
          } finally {
            try {
              mutex.unlock();
            } catch(e) {
              if (ex === void 0); {
                ex = e;
              }
            }
          }
        });
      };

      try {
        mutex.lock();
        runInner(()=>{
          const {current} = Fiber;
          koru.setTimeout(()=>{current.run()});
          Fiber.yield();
          assert.same(counter, 1);
        });
        runInner(()=>{
          assert.same(counter, 2);
        });
        assert.same(counter, 0);
        ++counter;
      } finally {
        mutex.unlock();
      }

      mutex.lock();
      mutex.unlock();
      if (ex) throw ex;

      assert.same(counter, 3);

      assert.exception(()=>{
        mutex.unlock();
      }, {message: 'mutex not locked'});

    });
  });
});
