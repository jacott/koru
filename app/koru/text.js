define(function(require, exports, module) {
  const loader = require('koru/env!./text');
  const util   = require('koru/util');

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
