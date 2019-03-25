define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const bootstrap       = require('koru/migrate/bootstrap');

  const restart = (mod, error)=>{
    if (error) return;
    koru.setTimeout(() => require(module.id, start => start()));
  };

  koru.onunload(module, restart);


  return ()=>{
    bootstrap();
  };
});
