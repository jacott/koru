define(function (require, exports, module) {
  const TH              = require('koru/model/test-db-helper');
  const {mockSubscribe} = require('koru/session/publish-test-helper');
  const Factory         = require('test/factory');

  const $$modelName$$ = require('models/$$modelModule$$');
  require('publish/$$publishModule$$');

  let test, v;

  TH.testCase(module, {
    setUp() {
      TH.startTransaction();
      test = this;
      v = {};
    },

    tearDown() {
      v = test =null;
      TH.endTransaction();
    },

    "test publish"() {
      const doc1 = Factory.create$$modelName$$();

      const sub = mockSubscribe(v, 's123', '$$publishName$$');

      assert.calledWith(v.conn.added, '$$publishName$$', doc1._id, doc1.attributes);

      const doc2 = Factory.create$$modelName$$();
      assert.calledWith(v.conn.added, '$$publishName$$', doc2._id, doc2.attributes);
    },
  });
});
