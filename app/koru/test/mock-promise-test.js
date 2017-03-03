define(function (require, exports, module) {
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

  const MockPromise = require('./mock-promise');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test _poll"() {
      /**
       * Synchronously run any outstanding promises.
       *
       **/
      api.method('_poll');
      api.example(() => {
        // How to stub a Promise
        TH.stubProperty((isServer ? global : self), 'Promise', {value: MockPromise});
        let done = false;
        Promise.resolve(true).then(v => done = v);
        assert.isFalse(done);
        Promise._poll();
        assert.isTrue(done);
      });
    },

    "test then chaining"() {
      const {p, resolve} = makePromise();

      p.then(v.r1 = this.stub().returns(5)).then(v.r3 = this.stub());
      p.then(v.r2 = this.stub());


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
    },

    "test promise.all"() {
      const p1 = makePromise();
      const p2 = makePromise();

      MockPromise.all([p1.p, p2.p]).then(v.done = this.stub());

      p1.resolve(3);
      MockPromise._poll();

      refute.called(v.done);

      p2.resolve(2);
      MockPromise._poll();

      assert.calledWith(v.done, [3, 2]);
    },

    "test then returns promise"() {
      const p1 = makePromise();
      const p2 = makePromise();

      p1.p.then(v.r1 = this.stub().returns(p2.p)).then(v.r2 = this.stub());

      p1.resolve(1);
      MockPromise._poll();

      assert.calledWith(v.r1, 1);
      refute.called(v.r2);

      p2.resolve(2);
      MockPromise._poll();

      assert.calledWith(v.r2, 2);
    },

    "test then throws error"() {
      const {p, resolve} = makePromise();

      p.then(() => {throw (v.error = new Error("fin1"))}).catch(v.c1 = this.stub());
      p.then(v.r2 = this.stub());

      resolve(4);
      MockPromise._poll();

      assert.calledWith(v.c1, v.error);
      assert.calledWith(v.r2, 4);

      assert(v.r2.calledBefore(v.c1));
    },

    "test Promise.resolve"() {
      MockPromise.resolve(2).catch(v.c1 = this.stub()).then(v.r1 = this.stub());
      refute.called(v.r1);
      MockPromise._poll();
      assert.calledWith(v.r1, 2);
      refute.called(v.c1);
    },

    "test Promise.reject"() {
      MockPromise.reject(2).then(v.r1 = this.stub()).catch(v.c1 = this.stub());
      refute.called(v.c1);
      MockPromise._poll();
      refute.called(v.r1);
      assert.calledWith(v.c1, 2);
    },
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
