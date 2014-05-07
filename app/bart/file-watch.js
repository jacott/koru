var fs = require('fs');
var Path = require('path');
var Fiber = require('fibers');
var Future = require('fibers/future');

define(['module', 'bart-session/server'], function(module, session) {
  var top = Path.resolve(Path.dirname(module.uri)+ '/..');
  console.log('DEBUG top',top);

  Fiber(function () {
    watch(top);
  }).run();

  function watch(dir) {
    var dirs = {};
    var watcher = fs.watch(dir, function (event, filename) {
      Fiber(function () {
        if (! filename.match(/^\w/)) return;
        console.log('event is: ' + event + ' for ' + dir);
        console.log('filename provided: ' + filename);
        var path = manage(dirs, dir, filename);
        if (path && path.match(/\.js$/))
          session.sendAll('U', path.slice(top.length + 1, - 3));
      }).run();
    });
    readdir(dir).forEach(function (filename) {
      if (! filename.match(/^\w/)) return;
      manage(dirs, dir, filename);
    });

    return watcher;
  }

  function manage(dirs, dir, filename) {
    var path = dir+'/'+filename;
    var st = stat(path);
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


function stat(path) {
  try {
    return futureWrap(fs, fs.stat, [path]);
  } catch (ex) {
    if (ex.code === 'ENOENT')
      return;

    throw ex;
  }
}

function readdir(path) {
  return futureWrap(fs, fs.readdir, [path]);
}


function futureWrap(obj, func, args) {
  var future = new Future;
  var results;

  var callback = function (error, data) {
    if (error) {
      future.throw(error);
      return;
    }
    results = data;
    future.return();
  };
  args.push(callback);
  func.apply(obj, args);
  future.wait();
  return results;
}
