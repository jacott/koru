define((require, exports, module)=>{
  const TH              = require('koru/model/test-db-helper');
  const publish         = require('koru/session/publish');
  const publishTH       = require('koru/session/publish-test-helper-client');
  const Factory         = require('test/factory');

  const {stub, spy, onEnd, util} = TH;

  const $$modelName$$ = require('models/$$modelModule$$');
  const $$publishName$$Sub = require('publish/$$fileName$$-sub');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      TH.startTransaction();
    });

    afterEach(()=>{
      TH.rollbackTransaction();
      v = {};
    });

    test("subscribe", ()=>{
      const sub = $$publishName$$Sub.subscribe([]);
      const matcher = sub._matchers.$$modelName$$;

      const doc1 = Factory.create$$modelName$$();

      assert.isTrue(matcher(doc1));
    });
  });
});
