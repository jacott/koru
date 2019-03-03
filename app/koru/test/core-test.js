define((require, exports, module)=>{
  /**
   * The heart of the test framework.
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, util} = TH;

  const Core = require('./core');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{

    test("properties", ()=>{
      assert.same(Core, TH.Core);
      api.property('test', {info: 'The currently running test'});
      assert.same(Core.test.name, 'koru/test/core test properties.');

      api.property('__elidePoint', {info: `
The current \`elidePoint\` in effect (if any) is an \`AssertionError\` used to replace the stack
trace of the actual error. Access can be useful to save and restore in custom assertion methods.
`});
      api.property('AssertionError', {info: 'the {#::AssertionError} class'});
      assert.same(Core.__elidePoint, null);
      assert.elideFromStack.same(Core.__elidePoint.constructor, Core.AssertionError);
      Core.__elidePoint = new Core.AssertionError();
    });

    group("AssertionError", ()=>{
      /**
       * An error thrown by an assertion methods.
       **/
      let aeApi;
      before(()=>{
        aeApi = api.innerSubject(Core.AssertionError, null);
      });

      after(()=>{aeApi = undefined});

      test("constructor", ()=>{
        /**
         * Create an AssertionError.

         * @param message the message for the error

         * @param elidePoint the number of stack frames to elide
         **/
        const AssertionError = aeApi.class();
        //[
        const err = new AssertionError("I failed");
        assert(err instanceof Error);
        assert.same(err.message, "I failed");

        const err2 = new AssertionError("I have a shortened stack", 2);
        assert(err instanceof Error);
        //]
      });
    });

    test("fail", ()=>{
      /**
       * throw assertionError
       *
       * @param message the error message

       * @param elidePoint the number of stack frames to elide
       **/
      api.customIntercept(assert, {name: 'fail', sig: 'assert.'});
      let ex;
      try {
        assert.fail("I failed", 1);
      } catch(e) {
        ex = e;
      }
      assert.instanceof(ex, Core.AssertionError);
      assert.same(ex.message, "I failed");
    });

    test("assert", ()=>{
      /**
       * Assert is truthy. Contains methods for more convenient assertions in {#::assert}. `assert`
       * is a global method.
       *
       * @param {boolean} truth `!! truth === true` otherwise an {#::AssertionError} is thrown.
       *
       * @param msg A message to display if the assertion fails
       **/
      api.method();
      //[
      let ex;
      //]
      {
        const {assert} = Core;
        //[
        try {
          assert(1, "I succeeded");
          assert(true, "So did I");
          assert(0, "I failed");
        } catch(e) {
          ex = e;
        }
        //]
      }
      //[
      assert.instanceof(ex, Core.AssertionError);
      assert.same(ex.message, "I failed");
      //]
    });

    test("refute", ()=>{
      /**
       * Assert is falsy. Contains methods for more convenient assertions in {#::assert}. `refute`
       * is a global method.
       *
       * @param {boolean} truth `!! truth === false` otherwise an {#::AssertionError} is thrown.
       *
       * @param msg A message to display if the assertion fails
       **/
      api.method();
      //[
      let ex;
      //]
      {
        const {assert} = Core;
        //[
        try {
          refute(0, "I succeeded");
          refute(false, "So did I");
          refute(true, "I failed");
        } catch(e) {
          ex = e;
        }
        //]
      }
      //[
      assert.instanceof(ex, Core.AssertionError);
      assert.same(ex.message, "I failed");
      //]
    });

    test("deepEqual", ()=>{
      /**
       * Like {#koru/util.deepEqual} except allows a hint to show where values don't match.
       **/
      api.method();
      const {deepEqual} = TH.Core;
      const hint = {};

      assert.isTrue(deepEqual(null, null));
      assert.isTrue(deepEqual(null, undefined));
      assert.isFalse(deepEqual(null, ""));
      assert.isTrue(deepEqual({}, {}));
      assert.isFalse(deepEqual(0, -0));
      assert.isFalse(deepEqual({a: 0}, {a: -0}));
      assert.isFalse(deepEqual({a: null}, {b: null}, hint, 'keyCheck'));
      assert.same(hint.keyCheck, '\n    {a: null}\n != {b: null}\nat key = a');


      const matcher = TH.match(v => v % 2 === 0);
      assert.isTrue(deepEqual([1, 2, null], [1, matcher, TH.match.any]));
      assert.isFalse(deepEqual([1, 1], [1, matcher]));
      assert.isFalse(deepEqual([2, 2], [1, matcher]));

      assert.isTrue(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [false]}]}}));

      assert.isFalse(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [true]}]}}));
      assert.isFalse(deepEqual({a: 1, b: {c: -0, d: [1, {e: [false]}]}}, {a: 1, b: {c: 0, d: [1, {e: [false]}]}}));

      assert.isFalse(deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [false], f: undefined}]}}));

      assert.isFalse(deepEqual({a: 1}, {a: "1"}));
    });
  });
});
