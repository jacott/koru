define(function(require, exports, module) {
  const koru            = require('koru');
  const Compilers       = require('koru/compilers');
  const templateCompiler = require('koru/dom/template-compiler');
  const fst             = require('koru/fs-tools');

  const {baseUrl} = module.ctx;

  koru.onunload(module, 'reload');

  return loader => {
    loader.load = (name, req, onload, config)=>{
      const mod = req.module;

      const provider = koru.buildPath(name)+'.html';
      const buildDir = provider.replace(/\.build\/.*/, '.build');
      const outPath = provider+'.js';

      const filename = baseUrl + name + ".html";

      Compilers.compile('html', filename, outPath);

      const pMod = mod.dependOn(provider);
      mod.body = function () {
        return pMod.exports;
      };
      onload();
    };
  };

});
