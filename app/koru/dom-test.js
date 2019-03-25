define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');
  const base            = require('./dom/base');

  const sut = require('./dom');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("wired", ()=>{
      assert.same(base, sut);
    });
  });
});
