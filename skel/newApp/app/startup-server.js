define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const bootstrap       = require('koru/migrate/bootstrap');
  const UserAccount     = require('koru/user-account');

  const restart = (mod, error)=>{
    if (error) return;
    koru.setTimeout(() => require(module.id, start => start()));
  };

  module.onUnload(restart);

  return ()=>{
    UserAccount.start();
    bootstrap();
  };
});
