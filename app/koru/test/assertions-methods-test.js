define((require, exports, module)=>{
  const TH   = require('koru/test-helper');

  const {stub, spy, onEnd, util, match: m} = TH;

  const sut  = require('./assertions-methods');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("benchmark", ()=>{
      const ans = assert.benchMark({
        duration: 100,
        subject() {
          return 'abc' + 'def';
        },
        control() {
          return 'abcdef';
        },
      });

      assert.equals(ans, {
        ns: m.number, error: m.number, controllNs: m.number, subjectlNs: m.number});
    });
  });
});
