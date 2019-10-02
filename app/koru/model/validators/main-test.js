define((require, exports, module)=>{
  'use strict';
  /**
   * The validators restrict the values of fields in a {#../../base-model;;Model}; either by setting
   * an error or converting the field values. Validators are invoked when a Model document is saved
   * or {#../../base-model#$isValid;()} is called.
   *
   * See {#../../validation}
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module({pseudoModule: 'Overview'});
    });

    test("register", ()=>{
      api.topic();

      assert(true);
    });
  });
});
