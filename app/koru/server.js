define(function (require, exports, module) {
  var env = require('./env');

  var session = require('./session/server-main');
  var htmlCompiler = require('./dom/template-compiler');
  var cssCompiler = require('./css/less-compiler');

  env.onunload(module, 'reload');

  return env;
});
