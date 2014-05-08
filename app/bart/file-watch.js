var fs = require('fs');
var Path = require('path');
var Fiber = require('fibers');
var Future = require('fibers/future');

define(['module', 'bart/core', 'bart/fs-tools', 'bart/session-server'], function(module, core, fst, session) {
  var top = Path.resolve(Path.dirname(module.uri)+ '/..');

  core.onunload(module, 'reload');

  Fiber(function () {
    watch(top);
  }).run();

  function watch(dir) {
    var dirs = {};
    console.log('DEBUG watch',dir);

    var watcher = fs.watch(dir, function (event, filename) {
      Fiber(function () {
        if (! filename.match(/^\w/)) return;
        // console.log('event is: ' + event + ' for ' + dir);
        // console.log('filename provided: ' + filename);
        var path = manage(dirs, dir, filename);
        if (path && path.match(/\.js$/))
          session.unload(path.slice(top.length + 1, - 3));
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
