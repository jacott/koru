isServer && define((require, exports, module)=>{
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const Fiber           = requirejs.nodeRequire('fibers');

  const {stub, spy, onEnd, util} = TH;

  const Mutex = require('./mutex');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("new, lock, unlock", ()=>{
      /**
       * Construct a Mutex.
       **/
      const Mutex = api.class();
      api.protoMethod("lock", {intro: ()=>{
        /**
         * Aquire a lock on the mutex. Will pause until the mutex is unlocked
         **/
      }});
      api.protoMethod("unlock", {intro: ()=>{
        /**
         * Release a lock on the mutex. Will allow another fiber to aquire the lock
         **/
      }});

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

    test("sequencing", ()=>{
      let ex;
      let counter = 0;

      const mutex = new Mutex;

      const runInner = (cb) =>{
        koru.runFiber(()=>{
          if (ex !== undefined) return;
          try {
            mutex.lock();
            cb();
            ++counter;
          } catch (e) {
            if (ex === undefined); {
              ex = e;
            }
          } finally {
            try {
              mutex.unlock();
            } catch(e) {
              if (ex === undefined); {
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
