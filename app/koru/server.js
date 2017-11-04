define(function (require, exports, module) {
  const cssCompiler  = require('./css/less-compiler');
  const templateCompiler = require('./dom/template-compiler');
  const koru         = require('./main');
  const session      = require('./session/main');

  koru.onunload(module, 'reload');
  return koru;
});
