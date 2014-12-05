var Future = require('../node_modules/fibers/future');
var wait = Future.wait;
var fs = require('fs');
var Path = require('path');
var readdir = Future.wrap(fs.readdir);
var stat = Future.wrap(fs.stat);

var less = require('../node_modules/less');
var autoprefixer = require("autoprefixer-core")({browsers: ['> 5%', 'last 2 versions']});

function findAll(dirPath, results) {
  var m;
  var filenames = readdir(dirPath).wait().filter(function (fn) {
    return /^[\w-]*(?:\.(css|less)$|$)/.test(fn);
  });
  var stats = filenames.map(function (filename) {
    return stat(Path.join(dirPath, filename));
  });

  wait(stats);

  for(var i = 0; i < filenames.length; ++i) {
    if (stats[i].get().isDirectory()) {
      findAll(Path.join(dirPath, filenames[i]), results);
    } else if (m = filenames[i].match(/^\w(.*)(less|css)$/)) {
      if (m[0].match(/-test\.(le|c)?ss$/)) continue;
      results.push([dirPath, m[0]]);
    }
  }
  return results;
}

function compile(dir, filename) {
  filename = Path.join(dir, filename);
  var src = fs.readFileSync(filename).toString();
  var future = new Future;

  less.render(src, {
    syncImport: true,
    paths: [dir], // for @import
    compress: true,
  }, function (error, output) {
    if (error) {
      var fn = error.filename || filename;
      if (fn === 'input') fn = filename;
      future.throw({
        toString: function () {return "Less compiler error: " + error.message},
        stack: "\tat "+ fn + ':' + error.line + ':' + (error.column + 1),
      });
    } else {
      future.return(autoprefixer.process(output.css).css);
    }
  });

  return future.wait();
}

module.exports = bundleCss;

function bundleCss(topDir, dirs) {
  return dirs.map(function (dir) {
    return findAll(Path.join(topDir, dir), []).map(function (pair) {
      return compile(pair[0], pair[1]);
    }).join("\n");
  }).join("\n");
};
