var Path = require('path');
var less = require("less");
var Future = require('fibers/future');

define(function(require, exports, module) {
  var core = require('../core');
  var fw = require('../file-watch');
  var fst = require('../fs-tools');

  core.onunload(module, 'reload');

  fw.listeners['less'] = compiler;

  var topLen = Path.resolve(require.toUrl("")).length + 1;

  var queue = {};
  var sendPaths = {};

  exports.buildFile = buildFile;
  exports._less = less;
  exports._queue = queue;

  function compiler(type, path, top, session) {
    path = top + path;
    if (path in queue) {
      queue[path] = 'redo';
      return;
    }
    queue[path] = 'compiling';

    while(path) {
      try {
        var outPath = buildFile(path);
        if (outPath)
          sendPaths[outPath] = true;
      } catch(ex) {
        core.error(ex);
      }
      if (queue[path] !== 'redo') delete queue[path];

      path = null;
      for(path in queue) {
        queue[path] = 'compiling';
        break;
      }
    }

    session.sendAll('SL', Object.keys(sendPaths).join(' '));
  }

  function buildFile(path) {
    var dir = Path.dirname(path);

    var src = fst.readFile(path).toString();
    var options = {
      syncImport: true,
      paths: [dir], // for @import
    };

    var parser = new less.Parser(options);
    var astFuture = new Future;
    var sourceMap = null;

    try {
      parser.parse(src, astFuture.resolver());
      var ast = astFuture.wait();

      var css = ast.toCSS({
        sourceMap: true,
      });
    } catch (ex) {
      var fn = ex.filename || path;
      if (fn === 'input') fn = path;
      core.error(core.util.extractError({
        toString: function () {return "Less compiler error: " + ex.message},
        stack: "\tat "+ fn + ':' + ex.line + ':' + (ex.column + 1),
      })+"\n");
      return;
    }

    dir = Path.join(dir,  ".build");

    fst.mkdir(dir);
    var outPath = Path.join(dir, Path.basename(path));

    fst.writeFile(outPath+".css", css);
    return outPath.slice(topLen);
  }
});
