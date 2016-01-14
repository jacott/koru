/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */

define(function(require, exports, module) {
  var koru = require('./main');
  var loaderPrefix = module.id + "!";

  koru.onunload(module, 'reload');

  return {
    load: function (name, req, onload, config) {
      var mod = req.module;

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
