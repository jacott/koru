define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');

  const {stub, spy} = TH;

  const Startup = require('./startup-server');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let req, mod;
    beforeEach(()=>{
      req = stub(); mod = {onUnload: stub()};
    });

    test("restartOnUnload with error", ()=>{
      Startup.restartOnUnload(req, mod);
      mod.onUnload.yield(null, 'my error');
      refute.called(req);
    });

    test("restartOnUnload without callback", ()=>{
      Startup.restartOnUnload(req, mod);
      mod.onUnload.yield(null, null);
      assert.called(req);

      const start = stub();
      req.yield(start);
      assert.called(start);
    });

    test("restartOnUnload with callback", ()=>{
      const callback = stub();
      Startup.restartOnUnload(req, mod, callback);
      mod.onUnload.yield(null, null);
      assert.called(req);

      const start = stub();
      assert.called(callback);
      req.yield(start);
      assert.called(start);
      assert.calledOnce(callback);
    });
  });
});
