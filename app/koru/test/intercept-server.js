define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const session         = require('koru/session');
  const Core            = require('koru/test/core');
  const WebServer       = require('koru/web-server');

  const parser          = requirejs.nodeRequire('@babel/parser');
  const traverse        = requirejs.nodeRequire('@babel/traverse').default;

  let initHandler = true, origDefaultHandler, expPath, repSrc;
  const parseOpts = {module: true, bare_returns: true};

  const defaultHandler = (req, res, path, error) => {
    const ans = origDefaultHandler !== void 0 && origDefaultHandler(req, res, path, error);
    if (ans !== false || path !== expPath) return ans;
    res.writeHead(200, {'Content-Type': 'application/x-javascript'});
    res.end(repSrc);
    return true;
  };

  const parseOptions = {plugins: ["classProperties"]};

  const isBindingLive = (me, binding) => {
    if (binding.path._guessExecutionStatusRelativeTo(me) !== 'after') {
      return true;
    } else {
      if (binding.path.isFunctionDeclaration()) return true;
      return false;
    }
  };


  const parseCode = (spos, interceptPrefix, source) => {

    let rep = '[_ko'+`ru_.__INTERCEPT$__]("${interceptPrefix}"`;

    for(let i = spos-1; i >= 0; --i) {
      const ch = source[i];
      if (/\W/.test(ch)) {
        if (ch === ".") return source.slice(0 , spos - 1) + rep + ')._' + source.slice(spos);
        break;
      }
    }

    const ast = parser.parse(source, parseOptions);

    let me;
    traverse(ast, {
      enter(path) {
        const {node} = path;
        if (node.start <= spos && node.end >= spos) {
          me = path;
        }
      }
    });

    rep += ",{";
    const bindings = me.scope.getBlockParent().getAllBindings();
    for (const name in bindings) {
      if (name.startsWith(interceptPrefix)) {
        const binding =  bindings[name];
        if (isBindingLive(me, binding)) {
          rep += name + ',';
        }
      }
    }

    return source.slice(0 , spos ) + "globalThis" + rep + "})._" + source.slice(spos);
  };


  return Intercept => {
    const {ctx} = module;

    let unloadId = '';
    let intercepting = false;

    const {readFileSync, loadModule} = ctx;

    class ServerIntercept extends Intercept {
      static finishIntercept() {
        if (expPath === void 0) return;
        if (! initHandler) {
          initHandler = true;
          WebServer.deregisterHandler('DEFAULT');
          WebServer.registerHandler('DEFAULT', origDefaultHandler);
          if (unloadId !== '') {
            session.unload(unloadId);
            unloadId = '';
          }
        }
        origDefaultHandler = void 0;
        super.finishIntercept();
        ctx.loadModule = loadModule;
        ctx.readFileSync = readFileSync;
        repSrc = expPath = void 0;
      }

      static sendResult(cand) {
        this.finishIntercept();
        this.ws.send('I' + cand);
      }

      static breakPoint(id, epos, interceptPrefix, source) {
        intercepting = id;
        expPath = '/'+id+'.js';
        Intercept.interceptObj = void 0;

        const spos = epos - interceptPrefix.length;
        repSrc = parseCode(spos, interceptPrefix, source);

        let thisMod = false;
        ctx.loadModule = mod => {
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
