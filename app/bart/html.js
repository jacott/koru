/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
define(['require', './env'], function (require, env) {
  var loaderPrefix = require.toUrl('./html!').slice(require.toUrl('').length);

  return {
    load: function (name, req, onload, config) {
      var provider = env.buildPath(name)+'.html';

      env.insertDependency(loaderPrefix + name, provider);

      req([provider], function (value) {
        onload(value);
      });
    }
  };
});
