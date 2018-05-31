define(function (require, exports, module) {
  const Random = require('koru/random');
  const util   = require('koru/util');
  const TH     = require('./test');

  const Diff  = require('./diff');

  TH.testCase(module, ({test, group})=>{
    test("diff", ()=>{
      const diff = new Diff();

      const ans = [[0, 'te'], [1, 'a'], [0, 's'], [-1, 't'], [0, 'ing']];

      assert.equals(diff.diff_main("testing", "teasing"), ans);

      assert.equals(diff.diff_toDelta(ans), '=2\t+a\t=1\t-1\t=3');

      assert.equals(diff.diff_fromDelta("testing", diff.diff_toDelta(ans)), ans);

      assert.equals(diff.diff_text1(ans), "testing");
      assert.equals(diff.diff_text2(ans), "teasing");
    });
  });
});
