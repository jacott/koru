var fs = require.nodeRequire('fs');

/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
define(['./dom/template-compiler'], function (templateCompiler) {
  var baseUrl;

  return {
    load: function (name, req, onload, config) {
      baseUrl = config.baseUrl;
      onload();
    },

    write: function (pluginName, name, write, config) {
      var html = fs.readFileSync(baseUrl + name + ".html").toString();

      var js = templateCompiler.toJavascript(html);

      write.asModule(pluginName + "!" + name,
                     "define(" + js + ");\n");
    }

  };
});
