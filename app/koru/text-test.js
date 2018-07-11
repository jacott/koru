define((require, exports, module)=>{
  const TH = require('./test-helper');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("require", ()=>{
      const text = require('./text!./test-data/example.sql');
      assert.same(text, 'select * from foo\n');
    });
  });
});
