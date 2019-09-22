define((require, exports, module)=>{
  'use strict';
  /**
   * Synchronous replacement for native promises. Delays running
   * promises until {#._poll} called rather than waiting for native
   * event loop.
   *
   * see
   * [Promise](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Promise)
   * for API
   **/
  const api = require('koru/test/api');
  const TH  = require('./main');

  const {stub} = TH;

  const MockPromise = require('./mock-promise');

  TH.testCase(module, ({beforeEach, afterEach, test})=>{
    let v = {};
    beforeEach(()=>{
      api.module();
    });

    afterEach(()=>{
      MockPromise._stop();
      v = {};
    });

    test("_poll", ()=>{
      /**
       * Synchronously run any outstanding promises.
       *
       **/
      api.method('_poll');

      //[
      // How to stub a Promise
      TH.stubProperty((isServer ? global : self), 'Promise', {value: MockPromise});
      let done = false;
      Promise.resolve(true).then(v => done = v);
      assert.isFalse(done);
      Promise._poll();
      assert.isTrue(done);
      //]
    });

    test("uncaught reject", ()=>{
      const p = new MockPromise((r, e) => {
        e(new Error("no catch"));
      }).then(foo => foo);
      assert.exception(() => {MockPromise._poll()}, {
        message: "Uncaught MockPromise: no catch",
      });

      const pc = new MockPromise((r, e) => {
        e(v.err = new Error("no catch"));
      }).then(foo => foo).catch(v.catch = stub());
      refute.exception(() => {MockPromise._poll()});
      assert.calledWith(v.catch, v.err);
    });

    test("catch rejects", ()=>{
      const p = MockPromise.reject(new Error("no catch"))
            .then(foo => foo).catch(foo => MockPromise.reject(123));
      assert.exception(() => {MockPromise._poll()}, {
        message: "Uncaught rejected MockPromise",
      });

      const pc = new MockPromise((r, e) => {
        e(v.err = new Error("no catch"));
      }).then(foo => foo).catch(v.catch = stub());
      refute.exception(() => {MockPromise._poll()});
      assert.calledWith(v.catch, v.err);
    });

    test("then chaining", ()=>{
      const {p, resolve} = makePromise();

      p.then(v.r1 = stub().returns(5)).then(v.r3 = stub());
      p.then(v.r2 = stub());


      resolve(4);

      refute.called(v.r1);

      MockPromise._poll();

      assert.calledWith(v.r1, 4);
      assert.calledWith(v.r2, 4);
      assert.calledWith(v.r3, 5);

      assert(v.r1.calledBefore(v.r2));
      assert(v.r2.calledBefore(v.r3));

      MockPromise._poll();

      assert.calledOnce(v.r1);
      assert.calledOnce(v.r3);
    });

    test("order of fulfilment", ()=>{
      const ans = [];
      const action = (n, x)=>(ans.push([n, x]),
                              n);

      const a = MockPromise.resolve(0);
      a
        .then(x => action(1, x))
        .then(x => (
          action(2, x),
          a.then(x => action(2.1, x))
            .then(x => action(2.2, x))
            .then(x => new MockPromise((g,b)=>{
              a.catch(x => action(-1, x));
              b(x);
              a.then(x => action(5, x));
            })).catch(x => action(-2, x))
        ));
      a
        .then(x => action(3, x))
        .then(x => action(4, x));

      MockPromise._poll();

      assert.equals(ans, [
        [1, 0], [3, 0], [2, 1], [4, 3], [2.1, 0], [2.2, 2.1], [5, 0], [-2, 2.2]]);
    });

    test("promise.all", ()=>{
      const p1 = makePromise();
      const p2 = makePromise();

      MockPromise.all([p1.p, p2.p, null, 123]).then(v.done = stub());

      p1.resolve(3);
      MockPromise._poll();

      refute.called(v.done);

      p2.resolve(2);
      MockPromise._poll();

      assert.calledWith(v.done, [3, 2, null, 123]);
    });

    test("then returns promise", ()=>{
      const p1 = makePromise();
      const p2 = makePromise();

      p1.p.then(v.r1 = stub().returns(p2.p)).then(v.r2 = stub());

      p1.resolve(1);
      MockPromise._poll();

      assert.calledWith(v.r1, 1);
      refute.called(v.r2);

      p2.resolve(2);
      MockPromise._poll();

      assert.calledWith(v.r2, 2);
    });

    test("then throws error", ()=>{
      const {p, resolve} = makePromise();

      p.then(() => {throw (v.error = new Error("fin1"))}).catch(v.c1 = stub());
      p.then(v.r2 = stub());

      resolve(4);
      MockPromise._poll();

      assert.calledWith(v.c1, v.error);
      assert.calledWith(v.r2, 4);

      assert(v.r2.calledBefore(v.c1));
    });

    test("MockPromise.resolve", ()=>{
      MockPromise.resolve(2).catch(v.c1 = stub()).then(v.r1 = stub());
      refute.called(v.r1);
      MockPromise._poll();
      assert.calledWith(v.r1, 2);
      refute.called(v.c1);
    });

    test("MockPromise.reject", ()=>{
      MockPromise.reject(2).then(v.r1 = stub())
        .catch(ex => {throw ex}).catch(v.c1 = stub()).then(v.r2 = stub());
      refute.called(v.c1);
      MockPromise._poll();
      refute.called(v.r1);
      assert.calledWith(v.c1, 2);
      assert.called(v.r2);
    });
  });

  function makePromise() {
    const ans = {};
    ans.p = new MockPromise((resolve, reject) => {
      ans.resolve = resolve;
      ans.reject = reject;
    });
    return ans;
  }
});
