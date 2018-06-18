define((require, exports, module)=>{
  /**
   * Main koru module. Responsible for:
   *
   * * Fibers
   * * Logging
   * * Dependency tracking and load/unload manager
   * * AppDir location
   **/
  const api  = require('koru/test/api');
  const TH   = require('./test-helper');
  const util = require('./util');

  const {stub, spy, onEnd} = TH;

  const koru = require('./main');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      api.module({subjectName: 'koru'});
    });

    test("KoruError", ()=>{
      const error = new koru.Error(500, 'the reason', 'the detail');
      assert.same(error.name, 'KoruError');
      assert.same(error.message, 'the reason [500]');

      assert.same(error.error, 500);
      assert.equals(error.reason, 'the reason');
      assert.equals(error.details, 'the detail');

      const err2 = new koru.Error(400, {name: [['is_invalid']]});
      assert.same(err2.message, `{name: [['is_invalid']]} [400]`);

      assert.equals(err2.reason, {name: [['is_invalid']]});
    });

    test("onunload", ()=>{
      /**
       * A wrapper around `module#onUnload`. see https://www.npmjs.com/package/yaajs
       **/
      api.method();

      //[
      const myModule = {id: 'myModule', onUnload: stub()};
      const callback = {stop() {}};
      koru.onunload(myModule, callback);
      assert.calledWith(myModule.onUnload, callback.stop);
      //]
      const onUnload = stub(module.constructor.prototype, 'onUnload');
      const func = stub();
      koru.onunload('koru/main-test', func);
      assert.calledWith(onUnload, func);
    });

    test("setTimeout", ()=>{
      stub(koru, 'error');
      stub(util, 'extractError').returns("EXTRACT CATCH ME");
      stub(isServer ? global : window, 'setTimeout').returns(123);

      const func = stub(null, null, ()=>{throw "CATCH ME"});
      var token = koru.setTimeout(func , 123000);

      assert.calledWith(setTimeout, TH.match.func, 123000);

      assert.same(token, setTimeout.firstCall.returnValue);

      refute.called(func);

      refute.called(koru.error);
      setTimeout.yield();
      assert.calledWith(koru.error, 'EXTRACT CATCH ME');

      assert.called(func);
    });

    test("clearTimeout", ()=>{
      stub(isServer ? global : window, 'clearTimeout');

      koru.clearTimeout(1234);

      assert.calledWith(clearTimeout, 1234);
    });

    test("buildPath", ()=>{
      /**
       * Converts path to related build path of compiled resource.
       * @param {string} path source path of resource.
       *
       * @returns build path for resource.
       */
      api.method();

      assert.equals(koru.buildPath('models/library/book'), 'models/library/.build/book');
      assert.equals(koru.buildPath('helper'), '.build/helper');
    });

    test("replaceProperty", ()=>{
      /**
       * Replace the property descriptor for the `name` property in `object`.
       *
       * @param object the object to replace `name` on.
       *
       * @param name the name of the property to replace (need not exist).
       *
       * @param descriptor the new descriptor to replace the old one. If the property does not
       * currently exist then the descriptor will be by default: writeable, enumerable and
       * configurable.
       *
       * @return the old descriptor or undefined if none.
       **/
      api.method();
      //[
      const foo = {get bar() {return 'orig'}};
      const orig = koru.replaceProperty(foo, 'bar', {value: 'new'});

      assert.equals(foo.bar, 'new');
      assert.equals(orig.get(), 'orig');

      let baz;

      assert.same(
        koru.replaceProperty(foo, 'baz', {set(v) {baz = v}}),
        undefined);

      foo.baz = 123;
      assert.same(baz, 123);

      assert.equals(Object.keys(foo).sort(), ['bar', 'baz']);
      //]
    });
  });
});
