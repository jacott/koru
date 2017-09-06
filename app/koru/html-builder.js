/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
define(function(require, exports, module) {
  const util             = require('koru/util');
  const templateCompiler = require('./dom/template-compiler');
  const fs = requirejs.nodeRequire('fs');

  const {baseUrl} = module.ctx;

  return {
    load(name, req, onload) {
      const filename = baseUrl + name + ".html";
      const html = fs.readFileSync(filename).toString();
      const js = templateCompiler.toJavascript(html, filename);

      onload.fromText("define(" + js + ");\n");
      onload();
    },
  };
});
