const fsp = require('fs/promises');
define((require) => {
  'use strict';
  const Compilers       = require('koru/compilers');
  const TemplateCompiler = require('koru/dom/template-compiler');

  Compilers.set('html', async (type, path, outPath) => {
    const html = (await fsp.readFile(path)).toString();
    const js = TemplateCompiler.toJavascript(html, path);

    await fsp.writeFile(outPath, 'define(' + js + ')');
  });
});
