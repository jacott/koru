define((require) => {
  'use strict';
  const Compilers       = require('koru/compilers');
  const TemplateCompiler = require('koru/dom/template-compiler');
  const util            = require('koru/util');
  const fsp             = requirejs.nodeRequire('fs/promises');

  const {Marked} = requirejs.nodeRequire('marked');
  const {gfmHeadingId} = requirejs.nodeRequire('marked-gfm-heading-id');

  const marked = new Marked();
  marked.use({gfm: true});
  marked.use(gfmHeadingId());

  Compilers.set('html-md', async (type, path, outPath) => {
    const html = marked.parse((await fsp.readFile(path)).toString());
    const js = TemplateCompiler.toJavascript(html, path);

    await fsp.writeFile(outPath, 'define(' + js + ')');
  });
});
