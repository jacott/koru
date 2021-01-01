define((require, exports, module)=>{
  'use strict';

  const session         = require('koru/session');
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

  const parseCode = (spos, interceptPrefix, source) => {

    const epos = spos - (/\w/.test(source[spos]) ? 1 : 0);

    let rep = '[_ko'+`ru_.__INTERCEPT$__]("${interceptPrefix}"`;

    let i = spos-1;
    for(; i >= 0; --i) {
      if (source[i] === ".")
        return source.slice(0 , spos - 1) + rep + ")" + source.slice(epos);
      if (/\S/.test(source[i])) break;
    }

    const nast = parser.parse(source, {});
    const names = {};

    traverse(nast, {
      enter(path) {
        const {node} = path;
        if (
          node.start <= spos && node.end >= spos) {
          for (const name in path.scope.bindings) {
            if (path.scope.bindings[name].identifier.start < spos) {
              names[name] = true;
            }
          }
        }
      }
    });

    rep += ",{" + Object.keys(names).join(", ") +"}";

    return source.slice(0 , spos ) + "globalThis" + rep + ")" + source.slice(spos + interceptPrefix.length);
  };


  return Intercept => {
    const {ctx} = module;

    const {readFileSync, loadModule} = ctx;

    class ServerIntercept extends Intercept {
      static finishIntercept() {
        if (! initHandler) {
          initHandler = true;
          WebServer.deregisterHandler('DEFAULT');
          WebServer.registerHandler('DEFAULT', origDefaultHandler);
        }
        origDefaultHandler = void 0;
        super.finishIntercept();
        ctx.loadModule = loadModule;
        ctx.readFileSync = readFileSync;
        repSrc = expPath = void 0;
      }

      static sendCandidates(cand) {
        this.finishIntercept();
        this.ws.send('I' + cand);
      }

      static breakPoint(id, epos, interceptPrefix, source) {
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
        session.unload(id);

        if (initHandler) {
          initHandler = false;
          origDefaultHandler = WebServer.getHandler('DEFAULT');
          WebServer.deregisterHandler('DEFAULT');
          WebServer.registerHandler('DEFAULT', defaultHandler);
        }
      }
    }

    if (isTest) ServerIntercept[isTest] = {
      get repSrc() {return repSrc},
      parseCode,
    };

    return ServerIntercept;
  };
});
