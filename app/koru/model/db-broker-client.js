define(() =>{
  let defaultDbId = 'default', threadDbId = 'default', mainDbId = 'default';

  const dbBroker = {
    setMainDbId(value) {return threadDbId = mainDbId = value || defaultDbId},

    setDefaultDbId(value) {defaultDbId = mainDbId = threadDbId = value},

    clearDbId() {
      threadDbId = mainDbId = defaultDbId;
    },

    withDB(dbId, func) {
      if (dbId === dbBroker.dbId)
        return func();

      const prev = threadDbId;
      try {
        dbBroker.dbId = dbId;
        return func();
      } finally {
        dbBroker.dbId = prev;
      }
    },
  };

  Object.defineProperty(dbBroker, 'dbId', {
    get: ()=>threadDbId, set: v =>{threadDbId = v || defaultDbId},
    configurable: true
  });

  return dbBroker;
});
