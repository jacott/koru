define(function(require, exports, module) {
  var koru = require('../main');
  var webServer = require('../web-server');
  var fst = require('../fs-tools');
  var templateCompiler = require('./template-compiler');

  koru.onunload(module, 'reload');

  webServer.compilers['html'] = compiler;

  function compiler(type, path, outPath) {
    var html = fst.readFile(path).toString();
    var js = templateCompiler.toJavascript(html);

    fst.writeFile(outPath, "define("+ js + ")");
  }
});
