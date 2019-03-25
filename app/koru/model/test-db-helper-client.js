define((require, exports, module)=>{
  'use strict';
  const util            = require('koru/util');
  const dbBroker        = require('./db-broker');
  const Model           = require('./main');
  const Factory         = require('./test-factory');
  const BaseTH          = require('./test-helper');

  const tranCount$ = Symbol();

  return {
    __proto__: BaseTH,
    startTransaction(db=Model.db) {
      Model.db = db;
      if (db[tranCount$] === undefined) {
        db[tranCount$] = 1;
      } else {
        ++db[tranCount$];
        Factory.startTransaction();
      }
    },

    rollbackTransaction(db=Model.db) {
      Model.db = db;

      const tc = db[tranCount$];
      if (tc === undefined)
        throw new Error("NO Transaction is in progress!");

      if (tc == 1) {
        db[tranCount$] = undefined;
        Factory.clear();
        for(const name in db) {
          Model[name].docs = undefined;
        }
      } else {
        --db[tranCount$];
        Factory.endTransaction();
      }
    },
  };
});
