define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');

  const called$ = Symbol();

  const {stub, spy, after, util, intercept, match: m} = TH;

  return ()=>{
    let StartupClientBody, req, exp, startOrder;
    const exps = {};
    const Module = module.constructor;

    const mockModule = new Module(void 0, 'startup-client');

    let preInit = true;

    const mockRequire = (name, exp)=>{
      if (preInit) {
        return exps[name] = exp || {};
      } else {
        const exp = exps[name];
        if (exp === void 0)
          throw new TH.Core.AssertionError("mockRequire can't find "+name, 1);
        exp[called$] = true;
        return exp;
      }
    };

    const checkExports = (reject)=>{
      for (const name in exps) {
        const exp = exps[name];
        if (exp[called$] === void 0) {
          reject(new TH.Core.AssertionError(`require not called on '${name}'`, 2));
          return false;
        }
      }
      return true;
    };

    const assertStartStop = (module)=> new Promise((resolve, reject)=>{
      // avoid loading StartupClient dependancies
      const targetId = module.id.slice(0, -5);
      const origDefine = window.define;
      intercept(window, 'define', body =>{
        StartupClientBody = body;
        origDefine({});
      });

      after(()=>{
        const mod = module.get(targetId);
        mod && mod.unload();
      });

      try {
        require(targetId, (s)=>{
          try {
            preInit = false;
            const KSC = 'koru/startup-client';
            const ksExp = exps[KSC] || mockRequire();
            ksExp.restartOnUnload = stub();
            ksExp.startStop = stub();
            exp = StartupClientBody(mockRequire, {}, mockModule);

            if (! ksExp.restartOnUnload.calledWith(mockRequire, mockModule))
              reject(new TH.Core.AssertionError(
                'KoruStartup.restartOnUnload(require, module) not called correctly', 1));
            else if (! ksExp.startStop.called)
              reject(new TH.Core.AssertionError('KoruStartup.startStop(...) not called', 1));
            else if (! ksExp.startStop.calledWith(...startOrder))
              reject(new TH.Core.AssertionError(
                'KoruStartup.startStop(<module>, ...) does not match startOrder ', 1));
            else if (checkExports(reject)) {
              assert(true);
              resolve();
            }
          } catch(err) {
            reject(err);
          }
        });

      } catch(err) {
        reject(err);
      }

    });

    return {
      mockRequire,
      mockModule,
      startOrder: (...args)=>{
        startOrder = args;
        for (const o of startOrder) {
          o.start = stub();
          o.stop = stub();
        }
      },
      assertStartStop,
    };
  };
});
