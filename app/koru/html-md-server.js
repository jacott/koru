define((require, exports, module)=>{
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

      const provider = koru.buildPath(name)+'.md.html';
      const buildDir = provider.replace(/\.build\/.*/, '.build');
      const outPath = provider+'.js';

      const filename = baseUrl + name + ".md";

      try {
        Compilers.compile('html-md', filename, outPath);
        const pMod = mod.dependOn(provider);
        mod.body = ()=> pMod.exports;
        onload();
      } catch(err) {
        onload.error(err);
      }

    },
  };
});
