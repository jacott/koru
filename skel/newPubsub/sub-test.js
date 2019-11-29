define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/model/test-db-helper');
  const Factory         = require('test/factory');

  const {stub, spy, util} = TH;

  const $$modelName$$ = require('models/$$modelModule$$');
  const $$publishName$$Sub = require('publish/$$fileName$$-sub');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      TH.startTransaction();
    });

    afterEach(()=>{
      TH.rollbackTransaction();
    });

    test("subscribe", ()=>{
      const sub = $$publishName$$Sub.subscribe([]);
      const matcher = sub._matchers.$$modelName$$;

      const doc1 = Factory.create$$modelName$$();

      assert.isTrue(matcher(doc1));
    });
  });
});
