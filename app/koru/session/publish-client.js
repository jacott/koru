define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');
  var publish = require('./publish-base');
  var Model = require('../model/base');

  var modelMatches = {};
  var key = 0;
  var empty = {};

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
      return {
        modelName: modelName,
        stop: function () {
          delete modelMatches[modelName][id];
        }
      };
    },

    _filterModels: function (models) {
      for(var name in models) {
        var mm = modelMatches[name] || {};
        var model = Model[name];
        var docs = model.docs;
        for (var id in docs) {
          var doc = docs[id];
          var remove = true;
          for(var key in mm) {
            if (mm[key](doc)) {
              remove = false;
              break;
            }
          }
          if (remove) {
            delete docs[id];
            model.notify(null, doc);
          }
        }
      }
    },
  });

  return publish;
});
