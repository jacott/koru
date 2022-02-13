define((require) => {
  'use strict';
  const Compilers       = require('koru/compilers');
  const TemplateCompiler = require('koru/dom/template-compiler');
  const util            = require('koru/util');
  const fsp             = requirejs.nodeRequire('fs/promises');
  const marked          = requirejs.nodeRequire('marked');

  const mdRenderer = new marked.Renderer();
  const mdOptions = {renderer: mdRenderer};

  Compilers.set('html-md', async (type, path, outPath) => {
    const html = marked.parse((await fsp.readFile(path)).toString(), mdOptions);
    const js = TemplateCompiler.toJavascript(html, path);

    await fsp.writeFile(outPath, 'define(' + js + ')');
  });
});
