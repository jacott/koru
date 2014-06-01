define(function(require, exports, module) {
  var util = require('../util');
  var env = require('../env');
  var publish = require('./publish-base');

  var modelMatches = {};
  var key = 0;

  util.extend(publish, {
    _matches: function(doc) {
      var mm = modelMatches[doc.constructor.modelName];
      for(var key in mm) {
        if (mm[key](doc)) return true;
      }
      return false;
    },

    _registerMatch: function (modelName, func) {
      modelName = typeof modelName === 'string' ? modelName : modelName.modelName;
      var id = (++key).toString(36);
      (modelMatches[modelName] || (modelMatches[modelName] = {}))[id] = func;
      return {stop: function () {
        delete modelMatches[modelName][id];
      }};
    },
  });

  return publish;
});
