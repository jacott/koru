var Path = require('path');
var http = require('http');
var send = require('send');
var parseurl = require('parseurl');

define(function (require, exports, module) {
  var core = require('./core');
  var fst = require('./fs-tools');

  core.onunload(module, 'reload');

  var __dirname = Path.dirname(module.uri);

  var root = Path.resolve(__dirname + '/..');

  var server = http.createServer(function (req, res) {
    core.Fiber(function () {
      var path = parseurl(req).pathname;

      var m = /^(.*\.build\/.*\.([^.]+))\.js$/.exec(path);
      if (! (m && compileTemplate(req, res, m[2], root+m[1])))
        send(req, path, {root: root})
        .on('error', sendDefault)
        .on('directory', sendDefault)
        .pipe(res);
    }).run();

    function sendDefault(err) {
      send(req, '/demo-index.html', {root: root})
        .on('error', error)
        .pipe(res);
    }

    function error(err) {
      if (! err || 404 === err.status) {
        res.statusCode = 404;
        res.end('NOT FOUND');
      } else {
        res.statusCode = 500;
        res.end('Internal server error!');
      }
    }
  });

  server.listen(3000);

  exports.server = server;
  exports.compilers = {};

  function compileTemplate(req, res, type, path) {
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
