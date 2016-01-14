define(function(require, exports, module) {
  var util = require('koru/util');
  var loader = require('koru/env!./text');

  return {
    load: function (name, req, onload, config) {
      var mod = req.module;
      if (mod.state === Module.READY) {
        onload();
        return;
      }

      var provider = koru.buildPath(name)+'.html';
      var pMod = mod.dependOn(provider);
      mod.body = function () {
        return pMod.exports;
      };
      onload();
    },
  }
});
