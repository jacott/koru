define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const {parse, scopeWalk, visitorKeys} = require('koru/parse/js-ast');
  const session         = require('koru/session');
  const Core            = require('koru/test/core');
  const WebServer       = require('koru/web-server');

  let initHandler = true, origDefaultHandler, expPath, repSrc;
  const parseOpts = {module: true, bare_returns: true};

  const defaultHandler = (req, res, path, error) => {
    const ans = origDefaultHandler !== undefined && origDefaultHandler(req, res, path, error);
    if (ans !== false || path !== expPath) return ans;
    res.writeHead(200, {'Content-Type': 'application/x-javascript'});
    res.end(repSrc);
    return true;
  };

  const parseCode = (sourceStart, interceptPrefix, sourceEnd) => {
    let rep = '[_ko' + `ru_.__INTERCEPT$__]("${interceptPrefix}"`;

    for (let i = sourceStart.length - 1; i >= 0; --i) {
      const ch = sourceStart[i];
      if (/[^$\w]/.test(ch)) {
        if (ch === '.') {
          return sourceStart.slice(0, i + (sourceStart[i - 1] === '?' ? 1 : 0)) + rep + ')._' + sourceEnd;
        }
        break;
      }
    }

    const spos = sourceStart.length;

    const ast = parse(sourceStart + sourceEnd);

    let me;
    const callback = (node, scope) => {
      if (node.start > spos) throw 'done';
      if (node.end >= spos) {
        me = scope;
        if (visitorKeys(node).length == 0) {
          throw 'done';
        }
      }
    };
    try {
      scopeWalk(ast, callback);
    } catch (done) {
      if (done !== 'done') throw done;
    }

    rep += ',{';
    const bindings = me.getAllBindings();
    for (const name in bindings) {
      if (name.startsWith(interceptPrefix)) {
        const binding = bindings[name];
        if (binding.isLive) {
          rep += name + ',';
        }
      }
    }

    return sourceStart.slice(0, interceptPrefix == '' ? undefined : - interceptPrefix.length) +
      'globalThis' + rep + '})._' + sourceEnd;
  };

  return (Intercept) => {
    const {ctx} = module;

    let unloadId = '';
    let intercepting = false;

    const {readFileSync, loadModule} = ctx;

    class ServerIntercept extends Intercept {
      static finishIntercept() {
        if (expPath === undefined) return;
        if (! initHandler) {
          initHandler = true;
          WebServer.deregisterHandler('DEFAULT');
          WebServer.registerHandler('DEFAULT', origDefaultHandler);
          if (unloadId !== '') {
            session.unload(unloadId);
            unloadId = '';
          }
        }
        origDefaultHandler = undefined;
        super.finishIntercept();
        ctx.loadModule = loadModule;
        ctx.readFileSync = readFileSync;
        repSrc = expPath = undefined;
      }

      static sendResult(cand) {
        this.finishIntercept();
        this.ws.send('I' + cand);
      }

      static breakPoint(id, sourceStart, interceptPrefix, sourceEnd) {
        intercepting = id;
        expPath = '/' + id + '.js';
        Intercept.interceptObj = undefined;

        repSrc = parseCode(sourceStart, interceptPrefix, sourceEnd);

        let thisMod = false;
        ctx.loadModule = (mod) => {
          thisMod = mod.id === id;
          return loadModule.call(ctx, mod);
        };
        ctx.readFileSync = (path) => {
          if (thisMod) {
            return repSrc;
          }
          return readFileSync(path);
        };
        session.unload(unloadId = id);

        if (initHandler) {
          initHandler = false;
          origDefaultHandler = WebServer.getHandler('DEFAULT');
          WebServer.deregisterHandler('DEFAULT');
          WebServer.registerHandler('DEFAULT', defaultHandler);
        }
      }

      static runComplete() {
        if (intercepting) {
          ServerIntercept.finishIntercept();
          intercepting = false;
        }
      }
    }

    if (isTest) {
      ServerIntercept[isTest] = {
        get repSrc() {return repSrc},
        parseCode,
      };

      Core.onEnd(ServerIntercept.runComplete);

      Core.onAbort(() => {
        if (intercepting) koru.reload();
      });
    }

    return ServerIntercept;
  };
});
