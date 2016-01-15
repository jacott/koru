var fs = require('fs');
var Future = requirejs.nodeRequire('fibers/future');
var Path = require('path');

define(function(require, exports, module) {
  var koru = require('./main');
  var Fiber = koru.Fiber;
  var fst = require('./fs-tools');
  var session = require('./session/base');
  var top = koru.appDir;

  koru.onunload(module, 'reload');

  exports.listeners = {
    js: function (type, path, top) {
      if (path.slice(-8) !== '.html.js')
        session.unload(path.slice(0, - 3));
    },

    html: function (type, path) {
      session.unload(koru.buildPath(path));
    },
  };

  function defaultUnloader(path) {
    session.unload(path);
  }

  exports.watch = function (dir, top) {
    watch(Path.resolve(dir), Path.resolve(top)+'/');
  };

  Fiber(function () {
    watch(top, top+'/');
  }).run();

  function watch(dir, top) {
    var dirs = {};

    var watcher = fs.watch(dir, function (event, filename) {
      Fiber(function () {
        if (! filename.match(/^\w/)) return;
        var path = manage(dirs, dir, filename, top);
        if (! path) return;

        var m = /\.(\w+)$/.exec(path);
        var handler = m && exports.listeners[m[1]];

        handler ? handler(m[1], path.slice(top.length), top, session) :
          defaultUnloader(path);
      }).run();
    });
    fst.readdir(dir).forEach(function (filename) {
      if (! filename.match(/^\w/)) return;
      manage(dirs, dir, filename, top);
    });

    return watcher;
  }

  function manage(dirs, dir, filename, top) {
    var path = dir+'/'+filename;
    var st = fst.stat(path);
    if (st) {
      if (st.isDirectory()) {
        dirs[filename] = watch(path, top);
        return;
      }
    } else {
      var watcher = dir[filename];
      if (watcher) {
        delete dir[filename];
        watcher.close();
      }
    }
    return path;
  }
});
