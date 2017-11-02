define(function (require, exports, module) {
  const Compilers       = require('koru/compilers');
  const fst             = require('./fs-tools');
  const IdleCheck       = require('./idle-check').singleton;
  const koru            = require('./main');
  const util            = require('./util');

  const Future          = requirejs.nodeRequire('fibers/future');
  const http            = requirejs.nodeRequire('http');
  const parseurl        = requirejs.nodeRequire('parseurl');
  const Path            = requirejs.nodeRequire('path');

  let send      = requirejs.nodeRequire('send');

  function WebServerFactory(host, port, root, DEFAULT_PAGE='/index.html', SPECIALS={}) {
    const koruParent = Path.join(koru.libDir, 'app');

    const handlers = {};

    const sendError = (err, msg='', res)=>{
      if (! err || 404 === err.status || 404 === err.error) {
        notFound(res);
      } else if (typeof err === 'number') {
        const attrs = {};
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
    };

    const requestListener = (req, res)=>{
      koru.runFiber(()=>{
        const error = (err, msg)=>{sendError(err, msg, res)};
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

          if (! (m && compileTemplate(res, m[2], Path.join(reqRoot, m[1]), m[3]))) {
            if (handlers.DEFAULT === undefined ||
                handlers.DEFAULT(req, res, path, error) === false) {
              send(req, path, {root: reqRoot, index: false})
                .on('error', error)
                .on('directory', error)
                .pipe(res);
            }
          }
        } catch(ex) {
          koru.unhandledException(ex);
          error(ex);
        } finally {
          IdleCheck.dec();
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
          koru.onunload(module, ()=>{webServer.deregisterHandler(key)});
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

    function compileTemplate(res, type, path, suffix) {
      if (! Compilers.has(type)) return;

      const paths = path.split('.build/');
      const outPath = path+suffix;
      try {
        return Compilers.compile(type, paths.join(''), outPath);
      } catch (err) {
        sendError(err, err.reason, res);
        return true;
      }
    }

    function notFound(res) {
      res.statusCode = 404;
      res.end('NOT FOUND');
    }

    return webServer;
  };

  return WebServerFactory;
});
