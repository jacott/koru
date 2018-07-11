define((require, exports, module)=>{
  const loader          = require('koru/env!./text');

  const Module = module.constructor;

  return {
    load(name, req, onload, config) {
      const mod = req.module;

      new Module(module.ctx, name, Module.READY);
      req.module.dependOn(name);
      loader.load(name, onload);
    },
  };
});
