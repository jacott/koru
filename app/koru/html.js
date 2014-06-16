/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
define(function (require, exports, module) {
  var koru = require('./main');
  var loaderPrefix = module.id + "!";

  koru.onunload(module, 'reload');

  return {
    load: function (name, req, onload, config) {
      var provider = koru.buildPath(name)+'.html';

      koru.insertDependency(loaderPrefix + name, provider);

      req([provider], function (value) {
        onload(value);
      }, onload.error);
    }
  };
});
