define(function(require) {
  const dbBroker = require('koru/model/db-broker');

  return function match() {
    const dbs = {};
    let key = 0;

    class StopFunc {
      constructor (id, dbId, modelName) {
        this.id = id;
        this.dbId = dbId;
        this.modelName = modelName;
      }

      stop () {
        if (! this.id) return;
        const models = dbs[this.dbId];
        const matchFuncs = models[this.modelName];
        delete matchFuncs[this.id];
        this.id = null;
      }
    };

    return {
      get _models() { return dbs[dbBroker.dbId]},

      has (doc) {
        const models = dbs[dbBroker.dbId];
        const mm = models && models[doc.constructor.modelName];
        for (let key in mm) {
          if (mm[key](doc)) return true;
        }
        return false;
      },

      register (modelName, comparator) {
        const {dbId} = dbBroker;
        modelName = typeof modelName === 'string' ? modelName : modelName.modelName;
        const id = (++key).toString(36);
        const models = dbs[dbId] || (dbs[dbId] = {});
        (models[modelName] || (models[modelName] = Object.create(null)))[id] = comparator;
        return new StopFunc(id, dbId, modelName);
      },
    };
  };
});
