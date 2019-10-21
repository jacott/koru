define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru/client');
  const Route           = require('koru/ui/route');

  return {
    restartOnUnload: (require, module, callback)=>{
      module.onUnload((mod, error)=>{
        if (error != null) return;
        callback !== void 0 && callback();
        const location = koru.getLocation();
        Route.replacePage(null);
        require(module.id, sc =>{
          sc.start();
          Route.replacePath(location);
        });
      });
    },

    startStop: (...args)=>({
      start: ()=>{for(let i = 0; i < args.length; ++i) args[i].start()},
      stop: ()=>{for(let i = args.length-1; i >= 0; --i) args[i].stop()}
    }),
  };
});
