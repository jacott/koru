define(function(require, exports, module) {
  const Compilers       = require('koru/compilers');
  const fst             = require('../fs-tools');
  const koru            = require('../main');
  const templateCompiler = require('./template-compiler');

  koru.onunload(module, 'reload');

  Compilers.set('html', compiler);

  function compiler(type, path, outPath) {
    const html = fst.readFile(path).toString();
    const js = templateCompiler.toJavascript(html, path);

    fst.writeFile(outPath, "define("+ js + ")");
  }
});
