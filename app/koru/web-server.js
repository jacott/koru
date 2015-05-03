var Path = require('path');
var http = require('http');
var send = requirejs.nodeRequire('send');
var parseurl = requirejs.nodeRequire('parseurl');
var Future = requirejs.nodeRequire('fibers/future');

define(function (require, exports, module) {
  var koru = require('./main');
  var fst = require('./fs-tools');
  var queue = require('./queue')();
  var util = require('./util');
  var IdleCheck = require('./idle-check').singleton;

  koru.onunload(module, 'reload');

  var root = require.toUrl('');
  var appDir = koru.appDir;
  var koruParent = Path.join(koru.libDir, 'app');


  var SPECIALS = {
    "index.js": indexjs,
    "require.js": indexjs,

    koru: function (m) {
      return [m[0], koruParent];
    },
  };

  function indexjs() {
    return [koru.config.indexjs || Path.join(koru.libDir, 'node_modules/requirejs/require.js'), '/'];
  }

  var handlers = {};

  var DEFAULT_PAGE = module.config().defaultPage || '/index.html';

  var server = http.createServer(requestListener);

  exports.start = function () {
    Future.wrap(server.listen).call(server, module.config().port || 3000, module.config().host).wait();
  };

  exports.stop = function () {
    server.close();
  };

  exports.server = server;
  exports.compilers = {};
  exports.requestListener = requestListener;

  exports.send = send;
  exports.parseurl = parseurl;
  exports.notFound = notFound;

  exports.parseUrlParams = function (req) {
    return util.searchStrToMap((typeof req === 'string' ? req : req.url).split('?', 2)[1]);
  };

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

  var count = 0;

  function requestListener(req, res) {koru.Fiber(function () {
    IdleCheck.inc();
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

      if (! (m && compileTemplate(req, res, m[2], Path.join(reqRoot, m[1]), m[3]))) {
        send(req, path, {root: reqRoot, index: false})
          .on('error', sendDefault)
          .on('directory', sendDefault)
          .pipe(res);
      }
    } catch(ex) {
      koru.error(koru.util.extractError(ex));
      error(ex);
    } finally {
      IdleCheck.dec();
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

    function error(err, msg) {
      if (! err || 404 === err.status) {
        notFound(res);
      } else if (typeof err === 'number') {
        res.statusCode = err;
        res.end(msg || '');
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
