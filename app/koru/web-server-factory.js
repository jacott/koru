define(function (require, exports, module) {
  const fst        = require('./fs-tools');
  const IdleCheck  = require('./idle-check').singleton;
  const koru       = require('./main');
  const queue      = require('./queue')();
  const util       = require('./util');
  const Path      = requirejs.nodeRequire('path');
  const http      = requirejs.nodeRequire('http');
  const parseurl  = requirejs.nodeRequire('parseurl');
  const Future    = requirejs.nodeRequire('fibers/future');

  let send      = requirejs.nodeRequire('send');

  module.exports = function WebServerFactory(host, port, root, DEFAULT_PAGE='/index.html', SPECIALS={}) {
    const koruParent = Path.join(koru.libDir, 'app');

    const handlers = {};

    const requestListener = (req, res)=>{
      koru.runFiber(()=>{
        IdleCheck.inc();
        try {
          let path = parseurl(req).pathname;
          let reqRoot = root;

          if (path === '/')
            path = DEFAULT_PAGE;

          let m = /^\/([^/]+)(.*)$/.exec(path);
          if (m) {
            var special = SPECIALS[m[1]];

            if (special) {
              var pr = typeof special === 'function' ? special(m) : special;
              path = pr[0]; reqRoot = pr[1];

            } else if(special = handlers[m[1]]) {
              special(req, res, m[2], error);
              return;
            }
          }

          m = /^(.*\.build\/.*\.([^.]+))(\..+)$/.exec(path);

          if (! (m && compileTemplate(req, res, m[2], Path.join(reqRoot, m[1]), m[3]))) {
            send(req, path, {root: reqRoot, index: false})
              .on('error', error)
              .on('directory', error)
              .pipe(res);
          }
        } catch(ex) {
          koru.unhandledException(ex);
          error(ex);
        } finally {
          IdleCheck.dec();
        }

        function error(err, msg) {
          if (! err || 404 === err.status) {
            notFound(res);
          } else if (typeof err === 'number') {
            const attrs = {};
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

      });
    };

    const server = http.createServer(requestListener);

    const webServer = {
      start() {
        Future.wrap(server.listen).call(server, port, host).wait();
      },

      stop() {
        server.close();
      },

      server,
      compilers: {},
      requestListener,

      send,
      parseurl,
      notFound,

      parseUrlParams(req) {
        return util.searchStrToMap((typeof req === 'string' ? req : req.url).split('?', 2)[1]);
      },

      // testing
      _replaceSend(value) {
        webServer.send = send = value;
      },

      registerHandler(module, key, func) {
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

      deregisterHandler(key) {
        delete handlers[key];
      },

      getHandler(key) {
        return handlers[key];
      },
    };

    function compileTemplate(req, res, type, path, suffix) {
      const compiler = webServer.compilers[type];
      if (! compiler) return;

      return queue(path, function () {
        const outPath = path+suffix;
        let paths = path.split('.build/');
        path = paths.join('');

        const srcSt = fst.stat(path);
        const jsSt = fst.stat(outPath);


        if (! srcSt) {
          notFound(res); // not found
          return true;
        }

        if (!jsSt) fst.mkdir(paths[0]+'.build');

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
