define(function (require, exports, module) {
  const TH        = require('koru/model/test-db-helper');
  const publishTH = require('koru/session/publish-test-helper-server');
  const Factory   = require('test/factory');

  const {stub, spy, onEnd, util} = TH;

  const $$modelName$$ = require('models/$$modelModule$$');
  require('publish/$$publishModule$$');

  let v = null;

  TH.testCase(module, {
    setUp() {
      TH.startTransaction();
      v = {};
      v.session = publishTH.mockSession();
    },

    tearDown() {
      v = null;
      TH.rollbackTransaction();
    },

    "test publish"() {
      const doc1 = Factory.create$$modelName$$();

      const sub = publishTH.mockSubscribe(v, 's123', '$$publishName$$');

      assert.calledWith(v.conn.added, '$$modelName$$', doc1._id, doc1.attributes);

      const doc2 = Factory.create$$modelName$$();
      assert.calledWith(v.conn.added, '$$modelName$$', doc2._id, doc2.attributes);
    },
  });
});
