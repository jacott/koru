var fs = requirejs.nodeRequire('fs');

/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
define(function(require, exports, module) {
  var util = require('koru/util');
  var templateCompiler = require('./dom/template-compiler');
  var baseUrl = module.ctx.baseUrl;

  return {
    load(name, req, onload) {
      var html = fs.readFileSync(baseUrl + name + ".html").toString();
      var js = templateCompiler.toJavascript(html);

      onload.fromText("define(" + js + ");\n");
      onload();
    },
  };
});
