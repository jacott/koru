var Future = require('fibers/future'), wait = Future.wait;
var fs = require('fs');
var Path = require('path');
var readdir = Future.wrap(fs.readdir);
var stat = Future.wrap(fs.stat);

define(function(require, exports, module) {
  var env = require('../env');
  var fw = require('../file-watch');
  var fst = require('../fs-tools');
  var session = require('../session/main');
  var topDir = env.appDir;

  env.onunload(module, 'reload');

  fw.listeners['less'] = watcher;

  session.provide('S', loadRequest);

  function loadRequest(data) {
    if (data.slice(0,2).toString() === 'LA')
      session.sendAll('SL', findAll(data.slice(2).toString(), []).join(' '));
  }

  function findAll(dir, results) {
    var m;
    var dirPath = Path.join(topDir, dir);
    var filenames = readdir(dirPath).wait().filter(function (fn) {
      return /^[\w-]*(?:\.(css|less)$|$)/.test(fn);
    });
    var stats = filenames.map(function (filename) {
      return stat(Path.join(dirPath, filename));
    });

    wait(stats);

    for(var i = 0; i < filenames.length; ++i) {
      if (stats[i].get().isDirectory()) {
        findAll(Path.join(dir, filenames[i]), results);
      } else if (m = filenames[i].match(/^\w.*(less|css)$/)) {
        if (m[1] === 'less')
          results.push(Path.join(dir, '.build', filenames[i]+'.css'));
        else
          results.push(Path.join(dir, filenames[i]));
      }
    }

    return results;
  }
  function watcher(type, path, top, session) {
    path = top + path;

    var dir = Path.join(Path.dirname(path),  ".build");
    var outPath = Path.join(dir, Path.basename(path)).slice(env.appDir.length + 1);

    session.sendAll('SL', outPath);
  }
});
