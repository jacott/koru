define((require, exports, module)=>{
  'use strict';

  exports.unloadCount = 2;
  exports.module = module;

  module.onUnload((mod)=>{
    if (mod === module)
      --exports.unloadCount;
  });

  exports.stop = function (arg) {
    if (arg === void 0 && this === exports)
      --this.unloadCount;
  };
  module.onUnload(exports);
});
