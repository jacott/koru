/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
define(['require', 'module'], function (require, module) {
  var koru;
  var loaderPrefix = module.id + "!";

  return {
    load: function (name, req, onload, config) {
      if (! koru) {
        require(['./main'], function (k) {
          koru = k;
          fetch();
        });
      } else
        fetch();

      function fetch() {
        var provider = koru.buildPath(name)+'.html';

        koru.insertDependency(loaderPrefix + name, provider);

        req([provider], function (value) {
          onload(value);
        }, onload.error);
      }
    },

    pluginBuilder: './html-builder',
  };
});
