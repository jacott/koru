define(function(require) {
  const util = require('../util');

  return function () {
    const dbs = {};
    var key = 0;

    class StopFunc {
      constructor (id, dbId, modelName) {
        this.id = id;
        this.dbId = dbId;
        this.modelName = modelName;
      }

      stop () {
        if (! this.id) return;
        var models = dbs[this.dbId];
        var matchFuncs = models[this.modelName];
        delete matchFuncs[this.id];
        this.id = null;
      }
    };

    return {
      get _models() { return dbs[util.dbId]},

      has (doc) {
        var models = dbs[util.dbId];
        var mm = models && models[doc.constructor.modelName];
        for(var key in mm) {
          if (mm[key](doc)) return true;
        }
        return false;
      },

      register (modelName, func) {
        var dbId = util.dbId;
        modelName = typeof modelName === 'string' ? modelName : modelName.modelName;
        var id = (++key).toString(36);
        var models = dbs[dbId] || (dbs[dbId] = {});
        (models[modelName] || (models[modelName] = Object.create(null)))[id] = func;
        return new StopFunc(id, dbId, modelName);
      },
    };
  };
});
