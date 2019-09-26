define((require, exports, module)=>{
  'use strict';
  /**
   * Main error class for koru errors.
   **/
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const KoruError = require('./koru-error');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module({subjectName: 'koru.Error'});
    });

    test("KoruError", ()=>{
      assert.same(KoruError, koru.Error);
    });

    test("constructor", ()=>{
      /**
       * Create a new koru.Error

       * @param error an http error code

       * @param reason the reason for the error or an object such as {#koru/model/validation}
       * results.

       **/
      api.protoProperty('error', {info: `The http error code for the error`});
      api.protoProperty('reason', {info: `The textual reason or an \`object\` with specific details`});

      const koru = {Error: api.class()};
      //[
      const error = new koru.Error(500, 'the reason');
      assert.same(error.name, 'KoruError');
      assert.same(error.message, 'the reason [500]');

      assert.same(error.error, 500);
      assert.equals(error.reason, 'the reason');

      const err2 = new koru.Error(400, {name: [['is_invalid']]});
      assert.same(err2.message, `{name: [['is_invalid']]} [400]`);

      assert.equals(err2.reason, {name: [['is_invalid']]});
      //]
    });
  });
});
