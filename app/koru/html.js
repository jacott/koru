/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */

define(function(require, exports, module) {
  var koru = require('./main');
  var loaderPrefix = module.id + "!";
  var Module = module.constructor;

  koru.onunload(module, 'reload');

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

    pluginBuilder: './html-builder',
  };
});
