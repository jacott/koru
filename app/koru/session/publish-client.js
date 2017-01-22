define(function(require, exports, module) {
  const Model   = require('koru/model/main');
  const koru    = require('../main');
  const util    = require('../util');
  const match   = require('./match');
  const publish = require('./publish-base');


  util.merge(publish, {
    match: match(),
    _filterModels(models) {
      for(var name in models) {
        var mm = this.match._models;
        mm = mm && mm[name];
        if (! mm) continue;
        var model = Model[name];
        if (! model) continue;
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
