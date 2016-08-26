define(function (require, exports, module) {
  const TH        = require('koru/model/test-db-helper');
  const publish   = require('koru/session/publish');
  const publishTH = require('koru/session/publish-test-helper-client');
  const Factory   = require('test/factory');

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
      v = test = null;
      TH.endTransaction();
    },

    "test publish"() {
      const pubFunc = publish._pubs.$$publishName$$;

      const sub = publishTH.mockSubscribe('$$publishName$$');
      const matcher = sub._mockMatches.get($$modelName$$);

      const doc1 = Factory.create$$modelName$$();

      assert.isTrue(matcher(doc1));
    },
  });
});
