/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
define(function (require, exports, module) {
  var env = require('./env');
  var loaderPrefix = module.id + "!";

  return {
    load: function (name, req, onload, config) {
      var provider = env.buildPath(name)+'.html';

      env.insertDependency(loaderPrefix + name, provider);

      req([provider], function (value) {
        onload(value);
      }, onload.error);
    }
  };
});
