define(function (require, exports, module) {
  const TH   = require('./test');

  const sut  = require('./symbols');
  TH.testCase(module, {
    "test names"() {
      const {symbol} = TH.match;
      assert.equals(sut, {
        stubName$: symbol,
        withId$: symbol,
        ctx$: symbol,
        endMarker$: symbol,
        stopGap$: symbol,
        private$: symbol,
        test$: symbol,
      });
    },
  });
});
