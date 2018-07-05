define((require, exports, module)=>{
  const markdown        = require('./markdown');
  const TH              = require('./test-helper');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("getMentionIds", ()=>{
      const md = "Hello @[Bob](123), how is @[Sally](567) but this is a [link](bad)";
      assert.equals(markdown.getMentionIds(md), ['123', '567']);
    });
  });
});
