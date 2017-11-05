define(function(require, exports, module) {
  const Compilers       = require('koru/compilers');
  const TemplateCompiler = require('koru/dom/template-compiler');
  const fst             = require('koru/fs-tools');
  const util            = require('koru/util');
  const marked          = requirejs.nodeRequire('marked');

  const mdRenderer = new marked.Renderer();
  const mdOptions = {renderer: mdRenderer};

  Compilers.set('html-md', (type, path, outPath)=>{
    const html = marked.parse(fst.readFile(path).toString(), mdOptions);
    const js = TemplateCompiler.toJavascript(html, path);

    fst.writeFile(outPath, "define("+ js + ")");
  });
});
