define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');
  var publish = require('./publish-base');
  var Model = require('../model/base');
  var match = require('./match');


  util.extend(publish, {
    match: match(),
    _filterModels: function (models) {
      for(var name in models) {
        var mm = this.match._models[name] || {};
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
