define(function(require) {
  let defaultDbId = 'default', threadDbId = 'default', mainDbId = 'default';
  const dbIdStack = [];

  const dbBroker = {
    get dbId() {return threadDbId},
    set dbId(value) {threadDbId = value || defaultDbId},

    pushDbId(value) {
      dbIdStack.push(threadDbId);
      threadDbId = value || defaultDbId;
    },

    popDbId() {
      threadDbId = dbIdStack.pop();
      if (dbIdStack.length === 0)
        threadDbId = mainDbId;
    },

    setMainDbId(value) {return threadDbId = mainDbId = value || defaultDbId},

    setDefaultDbId(value) {defaultDbId = mainDbId = threadDbId = value},

    clearDbId() {
      threadDbId = mainDbId = defaultDbId;
      dbIdStack.length = 0;
    },

    withDB(dbId, func) {
      if (dbId === dbBroker.dbId)
        return func();

      try {
        dbBroker.pushDbId(dbId);
        return func();
      } finally {
        dbBroker.popDbId();
      }
    },
  };

  return dbBroker;
});
