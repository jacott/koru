define(function(require, exports, module) {
  var util = require('../util');

  return function () {
    var models = {};
    var key = 0;


    function StopFunc(id, modelName) {
      this.id = id;
      this.modelName = modelName;
    }

    StopFunc.prototype = {
      constructor: StopFunc,

      stop: function () {
        if (! this.id) return;
        var matchFuncs = models[this.modelName];
        delete matchFuncs[this.id];
        this.id = null;
        for(var noop in matchFuncs) {
          return;
        }
        delete models[this.modelName];
      }
    };

    return {
      get _models() { return models},

      has: function(doc) {
        var mm = models[doc.constructor.modelName];
        for(var key in mm) {
          if (mm[key](doc)) return true;
        }
        return false;
      },

      register: function (modelName, func) {
        modelName = typeof modelName === 'string' ? modelName : modelName.modelName;
        var id = (++key).toString(36);
        (models[modelName] || (models[modelName] = {}))[id] = func;
        return new StopFunc(id, modelName);
      },
    };
  };
});
