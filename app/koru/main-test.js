define(function (require, exports, module) {
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

  const koru = require('./main');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module({subjectName: 'koru'});
    },

    tearDown() {
      v = null;
    },

    "test KoruError"() {
      const error = new koru.Error(500, 'the reason', 'the detail');
      assert.same(error.name, 'KoruError');
      assert.same(error.message, 'the reason [500]');

      assert.same(error.error, 500);
      assert.equals(error.reason, 'the reason');
      assert.equals(error.details, 'the detail');

      const err2 = new koru.Error(400, {name: [['is_invalid']]});
      assert.same(err2.message, `{name: [['is_invalid']]} [400]`);

      assert.equals(err2.reason, {name: [['is_invalid']]});
    },

    "test onunload"() {
      /**
       * A wrapper around `module#onUnload`. see https://www.npmjs.com/package/yaajs
       **/
      api.method('onunload');

      //[
      const myModule = {id: 'myModule', onUnload: test.stub()};
      const callback = {stop() {}};
      koru.onunload(myModule, callback);
      assert.calledWith(myModule.onUnload, callback.stop);
      //]
      const onUnload = test.stub(module.constructor.prototype, 'onUnload');
      koru.onunload('koru/main-test', v.stub = test.stub());
      assert.calledWith(onUnload, v.stub);
    },

    "test setTimeout"() {
      this.stub(koru, 'error');
      this.stub(util, 'extractError').returns("EXTRACT CATCH ME");
      test.stub(isServer ? global : window, 'setTimeout').returns(123);

      var token = koru.setTimeout(v.stub = this.stub(null, null, function () {
        throw "CATCH ME";
      }), 123000);

      assert.calledWith(setTimeout, TH.match.func, 123000);

      assert.same(token, setTimeout.firstCall.returnValue);

      refute.called(v.stub);

      refute.called(koru.error);
      setTimeout.yield();
      assert.calledWith(koru.error, 'EXTRACT CATCH ME');

      assert.called(v.stub);
    },

    "test clearTimeout"() {
      test.stub(isServer ? global : window, 'clearTimeout');

      koru.clearTimeout(1234);

      assert.calledWith(clearTimeout, 1234);
    },
  });
});
