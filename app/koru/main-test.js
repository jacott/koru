define(function (require, exports, module) {
  /**
   * Main koru module. Responsible for:
   *
   * * Fibers
   * * Logging
   * * Dependency tracking and load/unload manager
   * * AppDir location
   **/
  var test, v;
  const api  = require('koru/test/api');
  const koru = require('./main');
  const TH   = require('./test-helper');
  const util = require('./util');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module(koru, 'koru');
    },

    tearDown() {
      v = null;
    },

    "test onunload"() {
      /**
       * A wrapper around <module#onUnload>. see https://www.npmjs.com/package/yaajs
       **/
      api.method('onunload');

      api.example(() => {
        const myModule = {id: 'myModule', onUnload: test.stub()};
        const callback = {stop() {}};
        koru.onunload(myModule, callback);
        assert.calledWith(myModule.onUnload, callback.stop);
      });
      const onUnload = test.stub(module.constructor.prototype, 'onUnload');
      koru.onunload('koru/main-test', v.stub = test.stub());
      assert.calledWith(onUnload, v.stub);
    },

    "test setTimeout"() {
      test.stub(isServer ? global : window, 'setTimeout').returns(123);
      test.stub(util, 'Fiber').returns({run() {
        util.Fiber.lastCall.args[0]();
      }});

      var token = koru.setTimeout(v.stub = test.stub(), 123000);

      assert.calledWith(setTimeout, TH.match.func, 123000);

      assert.same(token, setTimeout.firstCall.returnValue);

      if (isServer) assert.calledWith(util.Fiber, TH.match.func);

      refute.called(v.stub);

      setTimeout.yield();

      assert.called(v.stub);
    },

    "test clearTimeout"() {
      test.stub(isServer ? global : window, 'clearTimeout');

      koru.clearTimeout(1234);

      assert.calledWith(clearTimeout, 1234);
    },
  });
});
