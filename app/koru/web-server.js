var Path = require('path');
var http = require('http');
var send = requirejs.nodeRequire('send');
var parseurl = requirejs.nodeRequire('parseurl');

define(function (require, exports, module) {
  var koru = require('./main');
  var fst = require('./fs-tools');
  var queue = require('./queue')();

  koru.onunload(module, 'reload');

  var root = require.toUrl('');
  var appDir = koru.appDir;
  var nmRoot = Path.resolve(appDir+'/../node_modules');

  var SPECIALS = {
    "require.js": function (m) {
      return ['require.js', module.config().requirejs ?
              Path.join(appDir, module.config().requirejs) :
              Path.join(nmRoot,'koru/node_modules/requirejs')];
    },

    koru: function (m) {
      return [m[0], fst.stat(nmRoot+'/koru/app') ? nmRoot+'/koru/app' : appDir];
    },
  };

  var handlers = {};

  var DEFAULT_PAGE = module.config().defaultPage || '/index.html';

  var server = http.createServer(requestListener);

  server.listen(module.config().port || 3000, module.config().host);

  exports.server = server;
  exports.compilers = {};
  exports.requestListener = requestListener;

  exports.send = send;
  exports.parseurl = parseurl;
  // testing
  exports._replaceSend = function (value) {
    exports.send = send = value;
  };

  exports.registerHandler = function (module, key, func) {
    if (typeof module === 'string') {
      func = key;
      key = module;
    } else {
      koru.onunload(module, function () {
        exports.deregisterHandler(key);
      });
    }
    if (key in handlers) throw new Error(key + ' already registered as a web-server hander');
    handlers[key] = func;
  };

  exports.deregisterHandler = function (key) {
    delete handlers[key];
  };

  exports.getHandler = function (key) {
    return handlers[key];
  };

  function requestListener(req, res) {koru.Fiber(function () {
    try {
      var path = parseurl(req).pathname;
      var reqRoot = root;

      var m = /^\/([^/]+)(.*)$/.exec(path);
      if (m) {
        var special = SPECIALS[m[1]];
        if (special) {
          var pr = special(m);
          path = pr[0]; reqRoot = pr[1];
        } else if(special = handlers[m[1]]) {
          special(req, res, m[2], error);
          return;
        }
      }

      var m = /^(.*\.build\/.*\.([^.]+))(\..+)$/.exec(path);

      if (! (m && compileTemplate(req, res, m[2], reqRoot+m[1], m[3]))) {
        send(req, path, {root: reqRoot, index: false})
          .on('error', sendDefault)
          .on('directory', sendDefault)
          .pipe(res);
      }
    } catch(ex) {
      koru.error(koru.util.extractError(ex));
    }

    function sendDefault(err) {
      if (err && err.status === 404) {
        if (path.match(/\.js$/)) {
          error(err);
          return;
        }
      }

      send(req, DEFAULT_PAGE, {root: root})
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
