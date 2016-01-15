define(function(require, exports, module) {
  var util = require('koru/util');
  var loader = require('koru/env!./text');

  var Module = module.constructor;

  return {
    load: function (name, req, onload, config) {
      var mod = req.module;

      var pMod = new Module(module.ctx, name, Module.READY);
      req.module.dependOn(name);
      loader.load(name, onload);
    },
  };
});
