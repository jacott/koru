define(function(require, exports, module) {
  const fst              = require('../fs-tools');
  const koru             = require('../main');
  const webServer        = require('../web-server');
  const templateCompiler = require('./template-compiler');

  koru.onunload(module, 'reload');

  webServer.compilers['html'] = compiler;

  function compiler(type, path, outPath) {
    const html = fst.readFile(path).toString();
    const js = templateCompiler.toJavascript(html, path);

    fst.writeFile(outPath, "define("+ js + ")");
  }
});
