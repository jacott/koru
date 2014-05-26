define(function(require, exports, module) {
  var env = require('../env');
  var core = require('../core');
  var fw = require('../file-watch');
  var fst = require('../fs-tools');
  var Path = require('path');

  env.onunload(module, 'reload');

  fw.listeners['less'] = watcher;

  function watcher(type, path, top, session) {
    path = top + path;

    var dir = Path.join(Path.dirname(path),  ".build");
    var outPath = Path.join(dir, Path.basename(path)).slice(env.appDir.length + 1);

    session.sendAll('SL', outPath);
  }
});
