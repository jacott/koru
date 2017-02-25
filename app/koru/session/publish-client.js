define(function(require, exports, module) {
  const ModelMap   = require('koru/model/map');
  const TransQueue = require('koru/model/trans-queue');
  const koru       = require('../main');
  const util       = require('../util');
  const match      = require('./match');
  const publish    = require('./publish-base');


  util.merge(publish, {
    match: match(),
    _filterModels(models) {
      TransQueue.transaction(() => {
        for(let name in models) {
          let mm = this.match._models;
          mm = mm && mm[name];
          if (! mm) continue;
          const model = ModelMap[name];
          if (! model) continue;
          const docs = model.docs;
          for (let id in docs) {
            const doc = docs[id];
            let remove = true;
            for(let key in mm) {
              if (mm[key](doc)) {
                remove = false;
                break;
              }
            }
            if (remove) {
              delete docs[id];
              model._indexUpdate.notify(null, doc); // first: update indexes
              model.notify(null, doc, true);
            }
          }
        }
      });
    },
  });

  return publish;
});
