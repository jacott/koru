define(function(require) {
  const util   = require('koru/util');
  const driver = require('koru/config!DBDriver');

  var dbBroker = {
    get db() {
      var thread = util.thread;
      return thread.db || (thread.db = driver.defaultDb);
    },
    set db(value) {
      value = value || driver.defaultDb;
      var thread = util.thread;
      thread.db = value;
      thread.dbId = value.name;
    },
    get dbId() {return dbBroker.db.name},

    clearDbId: function () {dbBroker.db = null}
  };

  return dbBroker;
});
