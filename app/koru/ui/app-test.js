define((require, exports, module)=>{
  'use strict';
  /**
   * App wide features
   **/
  const koru            = require('koru');
  const api             = require('koru/test/api');
  const Flash           = require('koru/ui/flash');
  const TH              = require('./test-helper');

  const {stub, spy, util, match: m} = TH;

  const App = require('./app');

  const {globalCallback} = koru;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      assert.same(koru.globalErrorCatch, void 0);
      assert.same(koru.globalCallback, globalCallback);
      assert.same(koru.unexpectedError, void 0);
    });

    test("flashUncaughtErrors", ()=>{
      /**
       * Use flash to display uncaught errors
       **/
      api.method();
      //[
      after(App.flashUncaughtErrors());
      stub(Flash, 'error');
      stub(Flash, 'notice');
      stub(koru, 'error');

      koru.unexpectedError("user message", "log message");
      assert.calledWith(Flash.error, "unexpected_error:user message");
      assert.calledWith(koru.error, "Unexpected error", 'log message');

      Flash.error.reset();
      koru.error.reset();
      koru.globalErrorCatch(new koru.Error(400, {name: [['is_invalid']]}));

      refute.called(Flash.error);
      assert.calledWith(Flash.notice, "Update failed: name: is not valid");
      assert.calledWith(koru.error, m(/400/));

      koru.globalErrorCatch(new koru.Error(500, "Something went wrong"));

      assert.calledWith(Flash.error, "Something went wrong");
      assert.calledWith(koru.error, m(/500/));

      koru.globalCallback(new koru.Error(404, "Not found"));
      assert.calledWith(Flash.notice, 'Not found');
      //]
    });
  });
});
