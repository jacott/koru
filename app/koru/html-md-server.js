define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Compilers       = require('koru/compilers');
  const markdownTemplateCompiler = require('koru/dom/markdown-template-compiler');
  const fst             = require('koru/fs-tools');

  const {baseUrl} = module.ctx;

  koru.onunload(module, 'reload');

  return {
    load(name, req, onload, config) {
      const mod = req.module;

      const provider = koru.buildPath(name) + '.md.html';
      const outPath = provider + '.js';

      const filename = baseUrl + name + '.md';

      try {
        Compilers.compile('html-md', filename, outPath).then(() => {
          const pMod = mod.dependOn(provider);
          mod.body = () => pMod.exports;
          onload();
        }, (err) => {
          onload.error(err);
        });
      } catch (err) {
        onload.error(err);
      }
    },
  };
});
