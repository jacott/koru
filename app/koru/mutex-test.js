isServer && define((require, exports, module)=>{
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, util} = TH;

  const Mutex = require('./mutex');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("new, lock, unlock", ()=>{
      /**
       * Construct a Mutex.
       **/
      const new_Mutex = api.new();
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
      const mutex = new_Mutex();

      let counter = 0, ex;

      const runInner = cb =>{
        koru.runFiber(()=>{
          if (ex !== undefined) return;
          try {
            mutex.lock();
            cb();
            ++counter;
          } catch (e) {
            ex = e;
          } finally {
            mutex.unlock();
          }
        });

      };

      try {
        mutex.lock();
        runInner(()=>{assert.same(counter, 1)});
        runInner(()=>{
          runInner(()=>{assert.same(counter, 3)});
          runInner(()=>{assert.same(counter, 4)});
          assert.same(counter, 2);
        });
        assert.same(counter, 0);
        ++counter;
      } finally {
        mutex.unlock();
      }
      if (ex) throw ex;
      //]

      try {
        mutex.lock();
        runInner(()=>{assert.same(counter, 6)});
        assert.same(counter, 5);
        ++counter;
      } finally {
        mutex.unlock();
      }
      if (ex) throw ex;

      assert.same(counter, 7);

      assert.exception(()=>{
        mutex.unlock();
      }, {message: 'mutex unlocked too many times'});

    });
  });
});
