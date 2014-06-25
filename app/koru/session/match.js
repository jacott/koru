define(function(require, exports, module) {
  var util = require('../util');

  return function () {
    var models = {};
    var key = 0;

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
        return stopFunc(id, modelName);
      },
    };

    function stopFunc(id, modelName) {
      return {
        modelName: modelName,
        stop: function () {
          if (! id) return;
          var matchFuncs = models[modelName];
          delete matchFuncs[id];
          id = null;
          for(var noop in matchFuncs) {
            return;
          }
          delete models[modelName];
        }
      };
    }
  };
});
