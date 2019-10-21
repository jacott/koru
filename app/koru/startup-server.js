define(()=>{
  'use strict';

  return {
    restartOnUnload: (require, module, callback)=>{
      module.onUnload((mod, error)=>{
        if (error != null) return;
        callback !== void 0 && callback();
        require(module.id, start => start());
      });
    }
  };
});
