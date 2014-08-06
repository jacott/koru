define(function (require, exports, module) {
  var koru = require('./main');

  var session = require('./session/main');
  var htmlCompiler = require('./dom/template-auto-compiler');
  var cssCompiler = require('./css/less-compiler');

  koru.onunload(module, 'reload');
});
