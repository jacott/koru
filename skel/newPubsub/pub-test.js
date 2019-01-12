define((require, exports, module)=>{
  const TH              = require('koru/model/test-db-helper');
  const session         = require('koru/session');
  const publishTH       = require('koru/session/publish-test-helper-server');
  const Factory         = require('test/factory');

  const {stub, spy, onEnd, util} = TH;

  const $$modelName$$ = require('models/$$modelModule$$');
  const $$publishName$$Pub = require('pubsub/$$fileName$$-pub');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    let conn;
    beforeEach(()=>{
      TH.startTransaction();
      conn = publishTH.mockConnection('sess1', session);
    });

    afterEach(()=>{
      TH.rollbackTransaction();
      v = {};
    });

    test("publish", ()=>{
      const doc1 = Factory.create$$modelName$$();

      const sub = conn.onMessage(['sub1', 1, "$$publishName$$"]);

      assert.calledWith(v.conn.sendBinary, 'A' ['$$modelName$$', doc1._id, doc1.attributes]);

      const doc2 = Factory.create$$modelName$$();
      assert.calledWith(v.conn.sendBinary, 'A', ['$$modelName$$', doc2._id, doc2.attributes]);
    });
  });
});
