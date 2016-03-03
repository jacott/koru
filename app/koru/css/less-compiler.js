var Path = require('path');
var less = requirejs.nodeRequire("less");
var Future = requirejs.nodeRequire('fibers/future');
var autoprefixer = requirejs.nodeRequire("autoprefixer")({browsers: ['> 5%', 'last 2 versions']});
var postcss = requirejs.nodeRequire("postcss")([autoprefixer]);

define(function(require, exports, module) {
  var koru = require('../main');
  var fst = require('../fs-tools');
  var webServer = require('../web-server');

  koru.onunload(module, 'reload');

  webServer.compilers['less'] = compile;

  var topLen = Path.resolve(koru.appDir).length + 1;

  var sendPaths = {};

  exports._less = less;
  exports.compile = compile;

  function compile(type, path, outPath) {
    var dir = Path.dirname(path);

    var src = fst.readFile(path).toString();
    var future = new Future;

    less.render(src, {
      syncImport: true,
      paths: [dir], // for @import
      filename: '/'+path.substring(topLen),
      sourceMap: {
        sourceMapFileInline: true,
      },
    }, function (error, output) {
      if (error) {
        var fn = error.filename || path;
        if (fn === 'input') fn = path;
        if (fn[0] === '/') fn = fn.slice(1);
        koru.error(koru.util.extractError({
          toString: function () {return "Less compiler error: " + error.message},
          stack: "\tat "+ fn + ':' + error.line + ':' + (error.column + 1),
        })+"\n");
        future.return(null);
      } else {
        postcss.process(output.css).then(function (result) {
          result.warnings().forEach(function (warn) {
            console.warn(warn.toString());
          });
          future.return(result.css);
        });
      }
    });

    var css = future.wait();

    css && fst.writeFile(outPath, css);
  }
});
