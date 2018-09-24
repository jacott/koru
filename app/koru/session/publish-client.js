define((require)=>{
  const ModelMap        = require('koru/model/map');
  const DocChange       = require('koru/model/doc-change');
  const Query           = require('koru/model/query');
  const TransQueue      = require('koru/model/trans-queue');
  const util            = require('koru/util');
  const Match           = require('./match');
  const publish         = require('./publish-base');

  util.merge(publish, {
    match: new Match(),
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
            for(const compare of mm) {
              if (compare(doc, reason)) {
                remove = false;
                break;
              }
            }
            if (remove) {
              delete docs[id];
              Query.notify(DocChange.delete(doc, reason));
            }
          }
        }
      });
    },
  });

  return publish;
});
