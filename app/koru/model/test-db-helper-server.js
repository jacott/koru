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

      dbBroker.db = txClient;
      txSave && txClient.query('BEGIN');
      inTran=true;
    },

    endTransaction() {
      if (! inTran)
        throw new Error("NO Transaction is in progress!");

      Factory.clear();
      for(var name in Model) {
        var model = Model[name];
        if ('docs' in model) {
          model._$docCacheClear();
        }
      }
      txSave && txClient.query('ROLLBACK');
      inTran=false;
    },
  });

  TH.geddon.onStart(function () {
    txClient = dbBroker.db;
    txClient._getConn();
    txSave = txClient._weakMap.get(util.thread);
    txSave.transaction = 'ROLLBACK';
  });
  TH.geddon.onEnd(function () {
    if (txSave) {
      txSave.transaction = null;
      txSave = null;
      txClient._releaseConn();
    }
  });

  module.exports = TH;
});
