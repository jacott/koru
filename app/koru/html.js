/**
   Load compiled template from .build directory.
   The template-compiler will convert the html to js.
*/

define((require, exports, module) => {
  'use strict';
  const koru            = require('./main');

  return {
    load(name, req, onload, config) {
      const mod = req.module;

      const provider = koru.buildPath(name) + '.html';
      const pMod = mod.dependOn(provider);
      mod.body = () => pMod.exports;
      onload();
    },

    pluginBuilder: './html-builder',
  };
});
