/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */

define(function(require, exports, module) {
  const koru = require('./main');

  koru.onunload(module, 'reload');

  if (isServer) {
    let loader;
    require(['koru/html-server'], htmlServer => loader = htmlServer);
    return loader;
  }

  return {
    load(name, req, onload, config) {
      const mod = req.module;

      const provider = koru.buildPath(name)+'.html';
      const pMod = mod.dependOn(provider);
      mod.body = function () {
        return pMod.exports;
      };
      onload();
    },

    pluginBuilder: './html-builder',
  };
});
