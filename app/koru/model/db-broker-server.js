define(function(require) {
  const util   = require('koru/util');
  const driver = require('koru/config!DBDriver');

  const dbBroker = {
    get db() {
      const {thread} = util;
      return thread.db || (thread.db = driver.defaultDb);
    },
    set db(value) {
      value = value || driver.defaultDb;
      const {thread} = util;
      thread.db = value;
      thread.dbId = value.name;
    },
    get dbId() {return dbBroker.db.name},

    clearDbId() {dbBroker.db = null}
  };

  return dbBroker;
});
