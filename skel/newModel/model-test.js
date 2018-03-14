define(function (require, exports, module) {
  const TH      = require('koru/model/test-db-helper');
  const Factory = require('test/factory');

  const {stub, spy, onEnd, util} = TH;

  const $$reqModel$$;
  let v = null;

  TH.testCase(module, {
    setUp() {
      TH.startTransaction();
      v = {};
    },

    tearDown() {
      v = null;
      TH.rollbackTransaction();
    },

    "test persistence"() {
      const doc = Factory.create$$modelName$$();

      const loaded = doc.$reload(true); // true avoids cache
      assert.same($$modelName$$.query.count(), 1);
      $$persistenceTest$$
    },
  });
});
