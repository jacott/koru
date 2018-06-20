define(function(require, exports, module) {
  const util     = require('koru/util');
  const Model    = require('./main');
  const dbBroker = require('./db-broker');
  const Factory  = require('./test-factory');
  const BaseTH   = require('./test-helper');

  let inTran=false;

  return {
    __proto__: BaseTH,
    startTransaction() {
      if (inTran)
        throw new Error("Transaction still in progress!");

      inTran=true;
    },

    rollbackTransaction() {
      if (! inTran)
        throw new Error("NO Transaction is in progress!");

      Factory.clear();
      const dbv = Model._databases.default;
      for(const name in dbv) {
        Model[name].docs = undefined;
      }
      inTran=false;
    },
  };
});
