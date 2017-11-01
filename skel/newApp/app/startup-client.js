define(function(require, exports, module) {
  const koru            = require('koru');
  const session         = require('koru/session');
  const Route           = require('koru/ui/route');
  const userAccount     = require('koru/user-account');
  const util            = require('koru/util');

  const restart = (mod, error)=>{
    Route.replacePage(null);
    stop();
    if (error) return;
    const modId = mod.id;
    window.requestAnimationFrame(()=>{
      require(modId, sc =>{
        sc.start && sc.start();
      });
    });
  };

  const start = ()=>{
    userAccount.init();
    session.connect();
  };

  const stop = ()=>{
    session.stop();
    userAccount.stop();
  };

  koru.onunload(module, restart);

  return {start, stop};
});
