define(function (require, exports, module) {
  const TH              = require('koru/test-helper');
  const validation      = require('../validation');

  const {stub, spy, onEnd} = TH;

  const sut             = require('./validate-validator').bind(validation);

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("calls", ()=>{
      const func = stub();
      const doc = {};

      sut(doc,'foo', func);

      assert.calledOnceWith(func, 'foo');
      assert.same(func.firstCall.thisValue, doc);
    });
  });
});
