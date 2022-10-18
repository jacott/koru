define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');

  const called$ = Symbol();

  const {stub, spy, after, util, intercept, match: m} = TH;

  return (module) => {
    let StartupServerBody, req, start;
    const exps = {};
    const Module = module.constructor;
    const targetId = module.id.slice(0, -5);

    const mockModule = new Module(undefined, targetId);

    let preInit = true;

    const mockRequire = (name, exp={}) => {
      if (preInit) {
        return exps[name] = exp;
      } else {
        const exp = exps[name];
        if (exp === undefined) {
          throw new TH.Core.AssertionError("mockRequire can't find " + name, 1);
        }
        exp[called$] = true;
        return exp;
      }
    };

    const checkExports = (reject) => {
      for (const name in exps) {
        const exp = exps[name];
        if (exp[called$] === undefined) {
          reject(new TH.Core.AssertionError(`require not called on '${name}'`, 2));
          return false;
        }
      }
      return true;
    };

    const init = () => new Promise((resolve, reject) => {
      const origDefine = global.__requirejsVars__.define;

      intercept(global.__requirejsVars__, 'define', (body) => {
        StartupServerBody = body;
        origDefine({});
      });

      after(() => {
        const mod = module.get(targetId);
        mod && mod.unload();
      });

      require(targetId, (s) => {
        preInit = false;
        start = StartupServerBody(mockRequire, {}, mockModule);

        if (checkExports(reject)) {
          resolve();
        }
      });
    });

    return {
      mockRequire,
      get exports() {return exps},
      init,
      mockModule,
      start: () => start(),
      startFunction: () => start,
    };
  };
});
