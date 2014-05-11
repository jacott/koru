/*global define, require */

var Path = require('path');
var http = require('http');
var express = require('express');
var send = require('send');
var parseurl = require('parseurl');

define(function (require, exports, module) {
  var core = require('./core');
  var fst = require('./fs-tools');

  core.onunload(module, 'reload');

  var __dirname = Path.dirname(module.uri);

  var app = express();

  var root = Path.resolve(__dirname + '/..');

  app.use(function(req, res, next) {
    core.Fiber(function () {
      var path = parseurl(req).pathname;

      var m = /^(.*\.build\/.*\.([^.]+))\.js$/.exec(path);
      if (! (m && compileTemplate(req, res, next, m[2], root+m[1])))
        next();
    }).run();
  });

  app.use(express.static(root));

  var server = http.createServer(app);

  server.listen(3000);

  exports.app = app;
  exports.server = server;
  exports.compilers = {};

  function compileTemplate(req, res, next, type, path) {
    var compiler = exports.compilers[type];
    if (! compiler) return;

    var outPath = path+'.js';
    var paths = path.split('.build/');
    path = paths.join('');

    var srcSt = fst.stat(path);
    var jsSt = fst.stat(outPath);

    if (!jsSt) fst.mkdir(paths[0]+'.build');

    if (! (srcSt || jsSt)) return ! notFound(res); // not found

    if (! jsSt || +jsSt.mtime < +srcSt.mtime) {
      compiler(type, path, outPath);
    }
  }

  function notFound(res) {
    res.statusCode = 404;
    res.end('NOT FOUND');
  }
});
