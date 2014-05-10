var fs = require('fs');
var Fiber = require('fibers');
var Future = require('fibers/future');

define(['module', 'bart/core', 'bart/fs-tools', 'bart/session-server'], function(module, core, fst, session) {
  var top = requirejs.toUrl('').slice(0,-1);

  core.onunload(module, 'reload');

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

        // FIXME need to deal with deleting obsolete compiled templates
        // and just handle this better
        if (path.slice(-3) === '.js' && path.slice(-8) !== '.html.js')
          session.unload(path.slice(top.length + 1, - 3));
        else if (path.slice(-5) === '.html')
          session.unload(path.slice(top.length + 1));
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
