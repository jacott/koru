var Path = requirejs.nodeRequire('path');
var http = requirejs.nodeRequire('http');
var send = requirejs.nodeRequire('send');
var parseurl = requirejs.nodeRequire('parseurl');
var Future = requirejs.nodeRequire('fibers/future');

define(function (require, exports, module) {
  var koru = require('./main');
  var util = require('./util');
  var fst = require('./fs-tools');
  var queue = require('./queue')();
  var IdleCheck = require('./idle-check').singleton;

  module.exports = function (host, port, root, SPECIALS, DEFAULT_PAGE) {
    SPECIALS = SPECIALS || {};
    var koruParent = Path.join(koru.libDir, 'app');

    var handlers = {};

    var server = http.createServer(requestListener);

    var webServer = {
      start: function () {
        Future.wrap(server.listen).call(server, port, host).wait();
      },

      stop: function () {
        server.close();
      },

      server: server,
      compilers: {},
      requestListener: requestListener,

      send: send,
      parseurl: parseurl,
      notFound: notFound,

      parseUrlParams: function (req) {
        return util.searchStrToMap((typeof req === 'string' ? req : req.url).split('?', 2)[1]);
      },

      // testing
      _replaceSend: function (value) {
        webServer.send = send = value;
      },

      registerHandler: function (module, key, func) {
        if (typeof module === 'string') {
          func = key;
          key = module;
        } else {
          koru.onunload(module, function () {
            webServer.deregisterHandler(key);
          });
        }
        if (key in handlers) throw new Error(key + ' already registered as a web-server hander');
        handlers[key] = func;
      },

      deregisterHandler: function (key) {
        delete handlers[key];
      },

      getHandler: function (key) {
        return handlers[key];
      },
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

        if (DEFAULT_PAGE)
          send(req, DEFAULT_PAGE, {root: root})
          .on('error', error)
          .pipe(res);
        else
          error(err);
      }

      function error(err, msg) {
        if (! err || 404 === err.status) {
          notFound(res);
        } else if (typeof err === 'number') {
          var attrs = {};
          msg = msg || '';
          if (typeof msg !== 'string') {
            msg = JSON.stringify(msg);
            attrs['Content-Type'] = 'application/json';
          }
          attrs['Content-Length'] = msg.length;
          res.writeHead(err, attrs);
          res.end(msg);
        } else {
          res.statusCode = 500;
          res.end('Internal server error!');
        }
      }

    }).run();}

    function compileTemplate(req, res, type, path, suffix) {
      var compiler = webServer.compilers[type];
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

    return webServer;
  };
});