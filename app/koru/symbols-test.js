define(function (require, exports, module) {
  const util            = require('koru/util');
  const TH              = require('./test');

  const sut  = require('./symbols');
  TH.testCase(module, {
    "test names"() {
      const {symbol} = TH.match;
      assert.equals(
        util.inspect(sut), '{'+
          'stubName$: Symbol(stubName$), '+
          'withId$: Symbol(withId$), '+
          'globalId$: Symbol(globalId$), '+
          'ctx$: Symbol(ctx$), '+
          'endMarker$: Symbol(endMarker$), '+
          'stopGap$: Symbol(stopGap$), '+
          'private$: Symbol(private$), '+
          'test$: Symbol(test$), '+
          'inspect$: Symbol(inspect$), '+
          'error$: Symbol(error$)'+
          '}'
      );
    },
  });
});
