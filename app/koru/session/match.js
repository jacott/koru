define(function(require) {
  const dbBroker = require('koru/model/db-broker');

  function match() {
    const dbs = {};
    let key = 0;

    class StopFunc {
      constructor(id, dbId, modelName) {
        this.id = id;
        this.dbId = dbId;
        this.modelName = modelName;
      }

      stop() {
        if (this.id === null) return;
        const matchFuncs = dbs[this.dbId][this.modelName];
        delete matchFuncs[this.id];
        this.id = null;
      }
    };

    return {
      get _models() {return dbs[dbBroker.dbId]},

      has(doc) {
        const models = dbs[dbBroker.dbId];
        const mm = models === undefined ? undefined : models[doc.constructor.modelName];
        for (const key in mm) if (mm[key](doc)) return true;
        return false;
      },

      register(modelName, comparator) {
        const {dbId} = dbBroker;
        modelName = typeof modelName === 'string' ? modelName : modelName.modelName;
        const id = (++key).toString(36);
        const models = dbs[dbId] === undefined ? (dbs[dbId] = {}) : dbs[dbId];
        (models[modelName] || (models[modelName] = Object.create(null)))[id] = comparator;
        return new StopFunc(id, dbId, modelName);
      },
    };
  };

  return match;
});
