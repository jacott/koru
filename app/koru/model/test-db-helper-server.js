define((require, exports, module) => {
  'use strict';
  const dbBroker        = require('koru/model/db-broker');
  const Driver          = require('koru/pg/driver');
  const util            = require('koru/util');
  const Model           = require('./main');
  const Factory         = require('./test-factory');
  const BaseTH          = require('./test-helper');

  const TestDBHelper = {
    __proto__: BaseTH,

    DBTranCounter: 0,

    async startTransaction(txClient=Model.db) {
      ++TestDBHelper.DBTranCounter;
      Model.db = txClient;
      const tx = await txClient.startTransaction();
      if (tx.savepoint == 0) {
        tx.transaction = 'ROLLBACK';
      } else {
        Factory.startTransaction();
      }
    },

    async rollbackTransaction(txClient=Model.db) {
      --TestDBHelper.DBTranCounter;
      Model.db = txClient;
      const level = await txClient.endTransaction('abort');

      for (const name in Model) {
        const model = Model[name];
        if ('docs' in model) {
          model._$docCacheClear();
        }
      }

      if (level == -1) {
        Factory.inTransaction || Factory.clear();
      } else {
        Factory.endTransaction();
      }
    },
  };

  return TestDBHelper;
});
