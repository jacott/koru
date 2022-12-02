define((require) => {
  'use strict';
  const driver          = require('koru/config!DBDriver');
  const DBRunner        = require('koru/model/db-runner');
  const util            = require('koru/util');

  const dbBroker = driver === undefined
        ? {
          get db() {},
          set db(v) {},
          clearDbId() {},
          get dbId() {},
        }
        : {
          get db() {
            return util.thread.db ??= driver.defaultDb;
          },
          set db(value) {
            value ??= driver.defaultDb;
            const {thread} = util;
            thread.db = value;
            thread.dbId = value.name;
          },
          get dbId() {return dbBroker.db.name},

          clearDbId: () => {dbBroker.db = undefined},
        };

  DBRunner(dbBroker);

  return dbBroker;
});
