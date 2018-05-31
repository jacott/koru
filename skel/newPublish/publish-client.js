define((require, exports, module)=>{
  const publish         = require('koru/session/publish');

  const $$modelName$$ = require('models/$$modelModule$$');

  publish(module, '$$publishName$$', function () {
    this.match($$modelName$$, ()=> true);
  });
});
