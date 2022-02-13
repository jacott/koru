define((require) => {
  'use strict';
  const driver          = require('koru/config!DBDriver');
  const DBRunner        = require('koru/model/db-runner');
  const util            = require('koru/util');

  const dbBroker = {
    get db() {
      if (driver === undefined) return;
      const {thread} = util;
      return thread.db || (thread.db = driver.defaultDb);
    },
    set db(value) {
      if (driver === undefined) return;
      if (value == null) value = driver.defaultDb;
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
