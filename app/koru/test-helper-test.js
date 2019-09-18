define((require, exports, module)=>{
  'use strict';
  /**
   * The Base TestHelper for all tests.
   *
   * The standard layout for a test file of say: `my-module.js` is called `my-module-test.js` and is
   * structured as follows:
   *
   * ```js
   * define((require, exports, module)=>{
   *   'use strict';
   *   const TH = require('test-helper'); // prefix test-helper with path to helper
   *
   *   const {stub, spy, util} = TH;
   *
   *   const MyModule  = require('./my-module');
   *
   *   TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
   *     beforeEach(()=>{
   *     });
   *
   *     afterEach(()=>{
   *     });
   *
   *     test("foo", ()=>{
   *       assert.equals(MyModule.foo(), "bar");
   *     });
   *
   *
   *   });
   * });
   * ```
   *
   * See the [Test Guide](./test-guide.html) for more details about writing tests.
   *
   **/

  const koru            = require('koru');
  const api             = require('koru/test/api');
  const stubber         = require('koru/test/stubber');
  const util            = require('koru/util');

  const {inspect$} = require('koru/symbols');

  const TH   = require('koru/test-helper');

  const {stub, spy, match} = TH;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.reportStubs();
    });
    test("testCase", ()=>{
      /**
       * Create a {#koru/test/test-case} and set the exports for `module` to the `testCase`.
       *
       * See [example](#koru/test-helper) above
       *
       * @param module the module for the test file.
       *
       * @param body A function that will [add tests](#koru/test-case#add). It is passed an object
       * with the following properties:

       * * `before(body)` - a function to run before all tests in the test case.
       * * `after(body)` - a function to run after all tests in the test case.
       * * `beforeEach(body)` - a function to run before each test in the test case.
       * * `afterEach(body)` - a function to run after each test in the test case.

       * * `group(name, body)` - adds a sub `TestCase` named `name`. `body` is again called with
       * this list of properties: (before, after, beforeEach, afterEach, group, test).

       * * `test(name, body)` - adds a Test named `name`. `body` is called when the test is run.
       *
       *   If the `body` has a `done` argument then the test will be asynchronous and done should be
       *   called with no argument on success and with a error on failure.
       *
       *   `body` may also be an async function

       * @return a {#koru/test-case} instance.
       **/
      api.method();
      const body = ()=>{};
      const myMod = {id: 'my-module-test'};
      const testCase = TH.testCase(myMod, body);

      assert.same(testCase, myMod.exports);
      assert.equals(testCase, TH.match.field('name', 'my-module'));
      assert.same(testCase.tc, undefined);
      assert.same(testCase.body, body);
    });

    test("properties", ()=>{
      api.property('test', {info: 'the current test that is running'});
      assert.equals(TH.test.name, 'koru/test-helper test properties.');

      api.property('util', {info: 'a convenience reference to {#koru/util}'});
      assert.same(TH.util, util);
    });

    group("MockModule", ()=>{
      let mmapi;
      before(()=>{
        mmapi = api.innerSubject(TH.MockModule, 'MockModule', {abstract() {
          /**
         * For when you want to mock a `module`
         **/
        }});
      });

      after(()=>{mmapi = undefined});

      test("new", ()=>{
        /**
         * Create a MockModule.
         **/
        const MockModule = mmapi.class();
        //[
        const myMod = new MockModule("my-id", {my: 'content'});
        assert.same(myMod.id, 'my-id');
        assert.equals(myMod.exports, {my: 'content'});
        //]
      });

      assert.isFunction(TH.MockModule.prototype.onUnload);
    });

    test("stub", ()=>{
      /**
       * A wrapper around {#koru/test/stubber.stub} that automatically restores after the
       * test/test-case has completed.
       *
       * @param { } args same as for {#koru/test/stubber.stub}
       **/
      spy(stubber, 'stub');
      api.method();
      const foo = {bar() {}};
      const stub1 = TH.stub(foo, 'bar');
      assert.same(stubber.stub.firstCall.returnValue, stub1);
      assert.calledWith(stubber.stub, foo, 'bar');
    });

    test("spy", ()=>{
      /**
       * A wrapper around {#koru/test/stubber.spy} that automatically restores after the
       * test/test-case has completed.
       *
       * @param { } args same as for {#koru/test/stubber.spy}
       **/
      spy(stubber, 'spy');
      api.method();
      const foo = {bar() {}};
      const stub1 = TH.spy(foo, 'bar');
      assert.same(stubber.spy.firstCall.returnValue, stub1);
      assert.calledWith(stubber.spy, foo, 'bar');
    });

    test("intercept", ()=>{
      /**
       * A wrapper around {#koru/test/stubber.intercept} that automatically restores after the
       * test/test-case has completed.
       *
       * @param { } args same as for {#koru/test/stubber.intercept}
       **/
      spy(stubber, 'intercept');
      api.method();
      const foo = {bar() {}};
      const stub1 = TH.intercept(foo, 'bar');
      assert.same(stubber.intercept.firstCall.returnValue, stub1);
      assert.calledWith(stubber.intercept, foo, 'bar');
    });

    test("stubProperty", ()=>{
      /**
       * A wrapper around {#koru/util.setProperty} that automatically restores after the
       * test/test-case has completed.
       *
       * @param { } args same as for {#koru/util.setProperty}
       *
       * @return a function to restore property to original setting.
       **/
      spy(util, 'setProperty');
      api.method();
      //[
      const foo = {get bar() {return 'orig'}};
      const restore = TH.stubProperty(foo, 'bar', {value: 'new'});

      assert.equals(foo.bar, 'new');
      restore();
      assert.equals(foo.bar, 'orig');
      //]

      assert.calledWith(util.setProperty, foo, 'bar');
    });

    test("after", ()=>{
      /**
       * Run `callback` after the test/test-case has completed.
       *
       * @param callback the function to run or an object with a `stop` function to run.
       **/
      api.method();
      //[
      const Library = {
        onAdd() {//...
          return {//...
            stop() {//...
            }};
        },
        removeAllBooks() {//...
        },
      };
      const listener = Library.onAdd();
      TH.after(listener);

      TH.after(()=> {Library.removeAllBooks()});
      //]
      assert(true); // onEnd not easily verifiable
    });
  });
});
