define(function (require, exports, module) {
  const Compilers       = require('koru/compilers');
  const fst             = require('./fs-tools');
  const IdleCheck       = require('./idle-check').singleton;
  const koru            = require('./main');
  const util            = require('./util');

  const http            = requirejs.nodeRequire('http');
  const parseurl        = requirejs.nodeRequire('parseurl');
  const Path            = requirejs.nodeRequire('path');

  let send      = requirejs.nodeRequire('send');

  function WebServerFactory(host, port, root, DEFAULT_PAGE='/index.html', SPECIALS={}) {
    const koruParent = Path.join(koru.libDir, 'app');

    const handlers = {};

    const sendError = (res, err, msg='')=>{
      if (err == null) {
        notFound(res);
      } else {
        const code = typeof err === 'number'
              ? err
              : +(err.statusCode || err.error || err.status);
        if (code == 0 || code != code) {
          res.statusCode = 500;
          res.end('Internal server error!');
          koru.unhandledException(err);
        } else {
          if (typeof err === 'object' && msg === '') msg = err.reason || err.message;
          const attrs = {};
          if (typeof msg !== 'string') {
            msg = JSON.stringify(msg);
            attrs['Content-Type'] = 'application/json';
          }
          attrs['Content-Length'] = Buffer.byteLength(msg);
          res.writeHead(code, attrs);
          res.end(msg);
        }
      }
    };

    const requestListener = (req, res)=>{
      koru.runFiber(()=>{
        const error = (err, msg)=>{sendError(res, err, msg)};
        IdleCheck.inc();
        try {
          let path = parseurl(req).pathname;
          let reqRoot = root;

          if (path === '/')
            path = DEFAULT_PAGE;

          let m = /^\/([^/]+)(.*)$/.exec(path);
          if (m) {
            const handler = handlers[m[1]];
            if (handler !== undefined) {
              handler(req, res, m[2], error, m[1]);
              return;
            }
            const special = SPECIALS[m[1]];

            if (special !== undefined) {
              const pr = typeof special === 'function' ? special(m) : special;
              path = pr[0]; reqRoot = pr[1];
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
          error(ex);
        } finally {
          IdleCheck.dec();
        }
      });
    };

    const server = http.createServer(requestListener);

    const webServer = {
      start() {
        util.Future.wrap(server.listen).call(server, port, host).wait();
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
        if (err.error === 404)
          notFound(res);
        else
          sendError(res, err);
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
