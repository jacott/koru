define(function (require, exports, module) {
  const TH      = require('koru/model/test-db-helper');
  const Factory = require('test/factory');

  const $$reqModel$$;
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

    "test persistence"() {
      const doc = Factory.create$$modelName$$();

      // avoid cache
      const loaded = $$modelName$$.where('_id', doc._id).fetchOne();
      assert.same($$modelName$$.query.count(), 1);
      $$persistenceTest$$
    },
  });
});
