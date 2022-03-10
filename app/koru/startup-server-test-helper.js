define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');

  const called$ = Symbol();

  const {stub, spy, after, util, intercept, match: m} = TH;

  return () => {
    let StartupServerBody, req, start;
    const exps = {};
    const Module = module.constructor;

    const mockModule = new Module(void 0, 'startup-server');

    let preInit = true;

    const mockRequire = (name, exp) => {
      if (preInit) {
        return exps[name] = exp || {};
      } else {
        const exp = exps[name];
        if (exp === void 0) {
          throw new TH.Core.AssertionError("mockRequire can't find " + name, 1);
        }
        exp[called$] = true;
        return exp;
      }
    };

    const checkExports = (reject) => {
      for (const name in exps) {
        const exp = exps[name];
        if (exp[called$] === void 0) {
          reject(new TH.Core.AssertionError(`require not called on '${name}'`, 2));
          return false;
        }
      }
      return true;
    };

    const init = (module) => new Promise((resolve, reject) => {
      const origDefine = global.__yaajsVars__.define;
      const targetId = module.id.slice(0, -5);

      intercept(global.__yaajsVars__, 'define', (body) => {
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
      init,
      mockModule,
      start: () => start(),
    };
  };
});
