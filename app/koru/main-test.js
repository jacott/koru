define((require, exports, module)=>{
  'use strict';
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

  const Module = module.constructor;

  const {stub, spy, onEnd} = TH;

  const koru = require('./main');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      api.module({subjectName: 'koru'});
    });

    test("getLocation", ()=>{
      if (isClient)
        assert.same(koru.getLocation(), window.location);
      else
        assert(isServer);
    });

    test("isServer, isClient", ()=>{
      assert.same(isClient, typeof process === 'undefined');
      assert.same(isServer, typeof process !== 'undefined');
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
      const onUnload = stub(Module.prototype, 'onUnload');
      const func = stub();
      koru.onunload('koru/main-test', func);
      assert.calledWith(onUnload, func);
    });

    test("setTimeout", ()=>{
      stub(koru, 'error');
      stub(util, 'extractError').returns("EXTRACT CATCH ME");
      stub(globalThis, 'setTimeout').returns(123);

      const func = stub(null, null, ()=>{throw "CATCH ME"});
      const token = koru.setTimeout(func , 123000);

      assert.calledWith(setTimeout, TH.match.func, 123000);

      assert.same(token, setTimeout.firstCall.returnValue);

      refute.called(func);

      refute.called(koru.error);
      setTimeout.yield();
      assert.calledWith(koru.error, 'EXTRACT CATCH ME');

      assert.called(func);
    });

    test("clearTimeout", ()=>{
      stub(globalThis, 'clearTimeout');

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
  });
});
