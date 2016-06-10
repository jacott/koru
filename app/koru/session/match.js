define(function(require, exports, module) {
  var util = require('../util');

  return function () {
    var dbs = {};
    var key = 0;


    function StopFunc(id, dbId, modelName) {
      this.id = id;
      this.dbId = dbId;
      this.modelName = modelName;
    }

    StopFunc.prototype = {
      constructor: StopFunc,

      stop: function () {
        if (! this.id) return;
        var models = dbs[this.dbId];
        var matchFuncs = models[this.modelName];
        delete matchFuncs[this.id];
        this.id = null;
      }
    };

    return {
      get _models() { return dbs[util.dbId]},

      has: function(doc) {
        var models = dbs[util.dbId];
        var mm = models && models[doc.constructor.modelName];
        for(var key in mm) {
          if (mm[key](doc)) return true;
        }
        return false;
      },

      register: function (modelName, func) {
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
