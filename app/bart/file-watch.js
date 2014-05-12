var fs = require('fs');
var Future = require('fibers/future');

define(function(require, exports, module) {
  var core = require('./core');
  var Fiber = core.Fiber;
  var fst = require('./fs-tools');
  var session = require('./session-server');
  var top = require.toUrl('').slice(0,-1);

  core.onunload(module, 'reload');

  exports.listeners = {
    js: function (type, path) {
      if (path.slice(-8) !== '.html.js')
        session.unload(path.slice(top.length + 1, - 3));
    },

    html: function (type, path) {
      session.unload(path.slice(top.length + 1));
    }
  };

  Fiber(function () {
    watch(top);
  }).run();

  function watch(dir) {
    var dirs = {};

    var watcher = fs.watch(dir, function (event, filename) {
      Fiber(function () {
        if (! filename.match(/^\w/)) return;
        var path = manage(dirs, dir, filename);
        if (! path) return;

        var m = /\.(\w+)$/.exec(path);
        var handler = m && exports.listeners[m[1]];

        handler && handler(m[1], path, session);
      }).run();
    });
    fst.readdir(dir).forEach(function (filename) {
      if (! filename.match(/^\w/)) return;
      manage(dirs, dir, filename);
    });

    return watcher;
  }

  function manage(dirs, dir, filename) {
    var path = dir+'/'+filename;
    var st = fst.stat(path);
    if (st) {
      if (st.isDirectory()) {
        dirs[filename] = watch(path);
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
