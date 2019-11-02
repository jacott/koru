define((require)=>{
  'use strict';
  const Compilers       = require('koru/compilers');
  const TemplateCompiler = require('koru/dom/template-compiler');
  const fst             = require('koru/fs-tools');

  Compilers.set('html', (type, path, outPath)=>{
    const html = fst.readFile(path).toString();
    const js = TemplateCompiler.toJavascript(html, path);

    fst.writeFile(outPath, "define("+ js + ")");
  });
});
