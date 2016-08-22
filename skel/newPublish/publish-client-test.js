define(function (require, exports, module) {
  const TH              = require('koru/model/test-db-helper');
  const publish         = require('koru/session/publish');
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
      const pubFunc = publish._pubs.$$publishName$$;

      const sub = mockSubscribe('$$publishName$$');
      const matcher = sub._matchers['$$modelName$$'];

      const doc1 = Factory.create$$modelName$$();

      assert.isTrue(matcher(doc1));
    },
  });
});
