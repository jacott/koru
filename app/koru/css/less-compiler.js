var Path = require('path');
var less = requirejs.nodeRequire("less");
var Future = requirejs.nodeRequire('fibers/future');

define(function(require, exports, module) {
  var koru = require('../main');
  var fst = require('../fs-tools');
  var webServer = require('../web-server');

  koru.onunload(module, 'reload');

  webServer.compilers['less'] = compile;

  var topLen = Path.resolve(koru.appDir).length + 1;

  var queue = {};
  var sendPaths = {};

  exports._less = less;
  exports._queue = queue;
  exports.compile = compile;
  exports.sendAll = sendAll;

  function sendAll(dir, top, session) {

  }

  function compile(type, path, outPath) {
    var dir = Path.dirname(path);

    var src = fst.readFile(path).toString();
    var options = {
      syncImport: true,
      paths: [dir], // for @import
      currentFileInfo: {
        filename: '/'+path.substring(topLen),
      },
    };

    var parser = new less.Parser(options);
    var future = new Future;
    var sourceMap = null;

    try {
      parser.parse(src, future.resolver());
      var css = future.wait().toCSS({
        sourceMap: true,
      });
    } catch (ex) {
      var fn = ex.filename || path;
      if (fn === 'input') fn = path;
      koru.error(koru.util.extractError({
        toString: function () {return "Less compiler error: " + ex.message},
        stack: "\tat "+ fn + ':' + ex.line + ':' + (ex.column + 1),
      })+"\n");
      return;
    }

    fst.writeFile(outPath, css);
  }
});
