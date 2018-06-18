define((require, exports, module)=>{
  const TH              = require('koru/test-helper');
  const Dom             = require('./dom-server');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("has document", ()=>{
      assert.same(Dom.h({id: 'food'}).nodeType, document.ELEMENT_NODE);
    });
  });
});
