define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/model/test-db-helper');
  const Factory         = require('test/factory');

  const {stub, spy, onEnd, util} = TH;

  const $$reqModel$$;
  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      TH.startTransaction();
    });

    afterEach(()=>{
      TH.rollbackTransaction();
      v = {};
    });

    test("persistence", ()=>{
      const doc = Factory.create$$modelName$$();

      const loaded = doc.$reload(true); // true avoids cache
      assert.same($$modelName$$.query.count(), 1);
      $$persistenceTest$$
    });
  });
});
