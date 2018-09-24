define((require, exports, module)=>{
  const publish         = require('koru/session/publish');

  const $$modelName$$ = require('models/$$modelModule$$');

  publish(module, '$$publishName$$', function () {
    $$modelName$$.onChange(dc =>{this.sendUpdate(dc)});
    $$modelName$$.query.forEach(doc =>{this.conn.added($$modelName$$, doc._id, doc.attributes)});
  });
});
