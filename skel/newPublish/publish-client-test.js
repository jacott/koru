define((require, exports, module)=>{
  const TH              = require('koru/model/test-db-helper');
  const publish         = require('koru/session/publish');
  const publishTH       = require('koru/session/publish-test-helper-client');
  const Factory         = require('test/factory');

  const {stub, spy, onEnd, util} = TH;

  const $$modelName$$ = require('models/$$modelModule$$');
  require('publish/$$publishModule$$');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      TH.startTransaction();
    });

    afterEach(()=>{
      TH.rollbackTransaction();
      v = {};
    });

    test("publish", ()=>{
      const pubFunc = publish._pubs.$$publishName$$;

      const sub = publishTH.mockSubscribe('$$publishName$$');
      const matcher = sub._mockMatches.get($$modelName$$);

      const doc1 = Factory.create$$modelName$$();

      assert.isTrue(matcher(doc1));
    });
  });
});
