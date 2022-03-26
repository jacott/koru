define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/model/test-db-helper');
  const Factory         = require('test/factory');

  const {stub, spy, util} = TH;

  const $$reqModel$$;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=> TH.startTransaction());
    afterEach(()=> TH.rollbackTransaction());

    test("defineFields", ()=>{
      assert.defineFields($$modelName$$, {
        $$modelFields$$,
      });
    });

    test("persistence", async ()=>{
      const doc = await Factory.create$$modelName$$();

      const loaded = await doc.$reload(true); // true avoids cache
      assert.same(await $$modelName$$.query.count(), 1);
      $$persistenceTest$$
    });
  });
});
