define(function(require, exports, module) {
  const util     = require('koru/util');
  const Model    = require('./main');
  const dbBroker = require('./db-broker');
  const Factory  = require('./test-factory');
  const BaseTH   = require('./test-helper');

  let txSave, txClient, inTran=false;

  const TH = util.protoCopy(BaseTH, {
    startTransaction() {
      if (inTran)
        throw new Error("Transaction still in progress!");

      inTran=true;
    },

    endTransaction() {
      if (! inTran)
        throw new Error("NO Transaction is in progress!");

      Factory.clear();
      let dbv = Model._databases.default;
      for(var name in dbv) {
        var model = Model[name];
        model.docs = null;
      }
      inTran=false;
    },
  });

  module.exports = TH;
});
