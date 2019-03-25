/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */

define((require, exports, module)=>{
  'use strict';
  const koru = require('./main');

  koru.onunload(module, 'reload');

  if (isServer) {
    let loader;
    require(['koru/html-md-server'], htmlServer => loader = htmlServer);
    return loader;
  }

  return {
    load(name, req, onload, config) {
      const mod = req.module;

      const provider = koru.buildPath(name)+'.md';
      const pMod = mod.dependOn(provider);
      mod.body = ()=> pMod.exports;
      onload();
    },

    pluginBuilder: './html-md-builder',
  };
});
