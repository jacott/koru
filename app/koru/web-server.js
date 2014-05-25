var Path = require('path');
var http = require('http');
var send = require('send');
var parseurl = require('parseurl');

define(function (require, exports, module) {
  var env = require('./env');
  var core = require('./core');
  var fst = require('./fs-tools');

  core.onunload(module, 'reload');

  var root = Path.resolve(require.toUrl(''));
  var koruApp = Path.resolve(Path.dirname(module.uri)+'/..');
  var nmRoot = koruApp+'/../node_modules';

  var SPECIALS = {
    "require.js": function (m, req, res, error) {
      send(req, '/requirejs/require.js', {root: nmRoot})
        .on('error', error)
        .pipe(res);
    },

    koru: function (m, req, res, error) {
      send(req, m[0], {root: koruApp})
        .on('error', error)
        .pipe(res);
    },
  };


  var server = http.createServer(function (req, res) {
    var path = parseurl(req).pathname;
    core.Fiber(function () {
      try {
        var m = /^\/([^/]+)(.*)$/.exec(path);
        var special = m && SPECIALS[m[1]];
        if (special) {
          special(m, req, res, error);
          return;
        }
        var m = /^(.*\.build\/.*\.([^.]+))(\.\a+)$/.exec(path);
        if (! (m && compileTemplate(req, res, m[2], root+m[1], m[3]))) {
          send(req, path, {root: root})
          .on('error', sendDefault)
          .on('directory', sendDefault)
          .pipe(res);
        }
      } catch(ex) {
        core.error(core.util.extractError(ex));
      }
    }).run();

    function sendDefault(err) {
      if (err && err.status === 404) {
        if (path.match(/\.js$/)) {
          error(err);
          return;
        }
      }
      send(req, '/'+env.mode+'/index.html', {root: root})
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

  server.listen(module.config().port || 3000);

  exports.server = server;
  exports.compilers = {};

  function compileTemplate(req, res, type, path, suffix) {
    var compiler = exports.compilers[type];
    if (! compiler) return;

    var outPath = path+suffix;
    var paths = path.split('.build/');
    path = paths.join('');

    var srcSt = fst.stat(path);
    var jsSt = fst.stat(outPath);

    if (!jsSt) fst.mkdir(paths[0]+'.build');

    if (! srcSt) return ! notFound(res); // not found

    if (! jsSt || +jsSt.mtime < +srcSt.mtime) {
      compiler(type, path, outPath);
    }
  }

  function notFound(res) {
    res.statusCode = 404;
    res.end('NOT FOUND');
  }
});
