define(function(require, exports, module) {
  const util     = require('koru/util');
  const Model    = require('./main');
  const dbBroker = require('./db-broker');
  const Factory  = require('./test-factory');
  const BaseTH   = require('./test-helper');

  let txSave, txClient, inTran = 0;

  const TH = util.protoCopy(BaseTH, {
    startTransaction() {
      dbBroker.db = txClient;
      if (++inTran === 1) {
        txSave && txClient.query('BEGIN');
      } else {
        Factory.startTransaction();
        txSave && txClient.query("SAVEPOINT s"+inTran);
      }
    },

    endTransaction() {
      if (--inTran < 0)
        throw new Error("NO Transaction is in progress!");

      for(var name in Model) {
        var model = Model[name];
        if ('docs' in model) {
          model._$docCacheClear();
        }
      }
      if (inTran === 0) {
        Factory.clear();
        txSave && txClient.query('ROLLBACK');
      } else {
        Factory.endTransaction();
        txSave && txClient.query("ROLLBACK TO SAVEPOINT s"+(inTran+1));
      }
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
