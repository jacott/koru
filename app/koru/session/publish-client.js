define(function(require, exports, module) {
  const ModelMap   = require('koru/model/map');
  const Query      = require('koru/model/query');
  const TransQueue = require('koru/model/trans-queue');
  const koru       = require('../main');
  const util       = require('../util');
  const match      = require('./match');
  const publish    = require('./publish-base');


  util.merge(publish, {
    match: match(),
    _filterModels(models, reason="noMatch") {
      TransQueue.transaction(() => {
        for(const name in models) {
          const _mm = this.match._models;
          if (_mm === undefined) continue;
          const mm = _mm[name];
          if (mm === undefined) continue;
          const model = ModelMap[name];
          if (model === undefined) continue;
          const docs = model.docs;
          for (const id in docs) {
            const doc = docs[id];
            let remove = true;
            for(const key in mm) {
              if (mm[key](doc, reason)) {
                remove = false;
                break;
              }
            }
            if (remove) {
              delete docs[id];
              Query.notify(null, doc, reason);
            }
          }
        }
      });
    },
  });

  return publish;
});
