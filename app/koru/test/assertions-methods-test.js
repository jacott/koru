define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const TH              = require('koru/test-helper');

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

    false &&
    test("try", ()=>{
      const plain = {};
      const map = koru.util.createDictionary();
      let counter;
      const ans = assert.benchMark({
        duration: 10000,
        setup() {counter=0},
        subject: ()=>{
          delete plain['x'+ counter];
          plain['x'+ ++counter] = counter;
        },
        control: ()=>{
          delete plain['x'+ counter];
          map['x'+ ++counter] = counter;
        },
      });

      koru.info(util.inspect(ans));

      assert(true);

    });
  });
});
