define((require, exports, module)=>{
  const Publication     = require('koru/pubsub/publication');

  const $$modelName$$ = require('models/$$modelModule$$');

  class $$publishName$$Pub extends Publication {
    init() {
      this.listeners = [$$modelName$$.onChange(dc =>{this.sendUpdate(dc)})];
      $$modelName$$.query.forEach(doc =>{this.conn.added($$modelName$$, doc._id, doc.attributes)});
    }

    stop() {
      if (this.listeners != null) {
        for (const listener of this.listeners)
          listener.stop();
      }
    }
  }
  $$publishName$$Pub.module = module;

  return $$publishName$$Pub;
});
