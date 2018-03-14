define(function(require, exports, module) {
  const dbBroker        = require('koru/model/db-broker');
  const Driver          = require('koru/pg/driver');
  const util            = require('koru/util');
  const Model           = require('./main');
  const Factory         = require('./test-factory');
  const BaseTH          = require('./test-helper');

  const inTran$ = Symbol(), txSave$ = Symbol();

  const {private$} = require('koru/symbols');

  const TH = util.protoCopy(BaseTH, {
    startTransaction(txClient=Driver.defaultDb) {
      dbBroker.db = txClient;
      const txSave = txClient[txSave$];
      const inTran = ++txClient[inTran$];

      if (inTran === 1) {
        txSave && txClient.query('BEGIN');
      } else {
        Factory.startTransaction();
        txSave && txClient.query("SAVEPOINT s"+inTran);
      }
    },

    rollbackTransaction(txClient=Driver.defaultDb) {
      const txSave = util.thread[txClient[txClient[private$].tx$]];
      const inTran = --txClient[inTran$];
      if (inTran < 0)
        throw new Error("NO Transaction is in progress!");

      for(const name in Model) {
        const model = Model[name];
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

    coreStartTransaction(txClient=Driver.defaultDb) {
    txClient[inTran$] = 0;
      txClient._getConn();
      const txSave = txClient[txSave$] = util.thread[txClient[txClient[private$].tx$]];
      txSave.transaction = 'ROLLBACK';
    },

    coreRollbackTransaction(txClient=Driver.defaultDb) {
      const txSave = txClient[txSave$];
      if (txSave !== undefined) {
        txSave.transaction = null;
        txClient[txSave$] = undefined;
        txClient._releaseConn();
      }
    },
  });


  return TH;
});
