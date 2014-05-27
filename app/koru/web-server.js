var Path = require('path');
var http = require('http');
var send = require('send');
var parseurl = require('parseurl');

define(function (require, exports, module) {
  var env = require('./env');
  var fst = require('./fs-tools');
  var queue = require('./queue')();

  env.onunload(module, 'reload');

  var root = Path.resolve(require.toUrl(''));
  var appDir = env.appDir;
  var nmRoot = appDir+'/../node_modules';

  var SPECIALS = {
    "require.js": function (m, req, res, error) {
      return ['/requirejs/require.js', nmRoot];
    },

    koru: function (m) {
      return [m[0], appDir];
    },
  };

  var server = http.createServer(requestListener);

  server.listen(module.config().port || 3000);

  exports.server = server;
  exports.compilers = {};
  exports.requestListener = requestListener;

  function requestListener(req, res) {env.Fiber(function () {
    try {
      var path = parseurl(req).pathname;
      var reqRoot = root;

      var m = /^\/([^/]+)(.*)$/.exec(path);
      var special = m && SPECIALS[m[1]];
      if (special) {
        var pr = special(m);
        path = pr[0]; reqRoot = pr[1];
      }

      var m = /^(.*\.build\/.*\.([^.]+))(\..+)$/.exec(path);

      if (! (m && compileTemplate(req, res, m[2], reqRoot+m[1], m[3]))) {
        send(req, path, {root: reqRoot})
          .on('error', sendDefault)
          .on('directory', sendDefault)
          .pipe(res);
      }
    } catch(ex) {
      env.error(env.util.extractError(ex));
    }

    function sendDefault(err) {
      if (err && err.status === 404) {
        if (path.match(/\.js$/)) {
          error(err);
          return;
        }
      }

      send(req, '/index.html', {root: root})
        .on('error', error)
        .pipe(res);
    }

    function error(err) {
      if (! err || 404 === err.status) {
        notFound(res);
      } else {
        res.statusCode = 500;
        res.end('Internal server error!');
      }
    }

  }).run();}

  function compileTemplate(req, res, type, path, suffix) {
    var compiler = exports.compilers[type];
    if (! compiler) return;

    return queue(path, function () {
      var outPath = path+suffix;
      var paths = path.split('.build/');
      path = paths.join('');

      var srcSt = fst.stat(path);
      var jsSt = fst.stat(outPath);


      if (!jsSt) fst.mkdir(paths[0]+'.build');

      if (! srcSt) {
        notFound(res); // not found
        return true;
      }

      if (! jsSt || +jsSt.mtime < +srcSt.mtime) {
        compiler(type, path, outPath);
      }
    });
  }

  function notFound(res) {
    res.statusCode = 404;
    res.end('NOT FOUND');
  }
});
