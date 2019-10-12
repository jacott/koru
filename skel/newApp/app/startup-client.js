define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const session         = require('koru/session');
  const UserAccount     = require('koru/user-account');

  const restart = (mod, error)=>{
    if (error) return;
    const modId = mod.id;
    window.requestAnimationFrame(()=>{
      require(modId, sc =>{sc.start && sc.start()});
    });
  };

  const start = ()=>{
    UserAccount.start();
    session.connect();
  };

  const stop = ()=>{
    session.stop();
    UserAccount.stop();
  };

  module.onUnload(restart);

  return {start, stop};
});
