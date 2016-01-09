/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
// define(['require', 'module'], function (require, module) {
//   var koru;
//   var loaderPrefix = module.id + "!";

//   return {
//     load: function (name, req, onload, config) {
//       if (! koru) {
//         require(['./main'], function (k) {
//           koru = k;
//           fetch();
//         });
//       } else
//         fetch();

//       function fetch() {
//         var provider = koru.buildPath(name)+'.html';

//         req(provider, function (value, pMod) {
//           pMod.addDependancy(req.module);
//           onload(value);
//         }, onload.error);
//       }
//     },

//     pluginBuilder: './html-builder',
//   };
// });


define(function(require, exports, module) {
  var koru = require('./main');
  var loaderPrefix = module.id + "!";
  var Module = module.constructor;

  koru.onunload(module, 'reload');

  return {
    load: function (name, req, onload, config) {
      var mod = req.module;
      if (mod.state === Module.READY) {
        onload();
        return;
      }

      var provider = koru.buildPath(name)+'.html';

      req(provider, function (value, pMod) {
        pMod.addDependancy(req.module);
        onload(value);
      }, onload.error);
    },

    pluginBuilder: './html-builder',
  };
});
