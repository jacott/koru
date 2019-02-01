define((require, exports, module)=>{
  const Publication     = require('koru/pubsub/publication');

  const $$modelName$$ = require('models/$$modelModule$$');

  class $$publishName$$Pub extends Publication {
    init() {
      this.handles = [$$modelName$$.onChange(dc =>{this.sendUpdate(dc)})];
      $$modelName$$.query.forEach(doc =>{this.conn.added($$modelName$$, doc._id, doc.attributes)});
    }

    stop() {
      if (this.handles !== void 0) {
        for (const handle of this.handles)
          handle.stop();
        this.handles = void 0;
      }
    }
  }
  $$publishName$$Pub.module = module;

  return $$publishName$$Pub;
});
