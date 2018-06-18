define((require, exports, module)=>{
  /**
   * Well known koru symbols.
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const sut  = require('./symbols');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("names", ()=>{
      api.property('stubName$', {
        info: `Used to name stubbed functions in API documentation`});
      api.property('withId$', {
        info: `Used to associate and id with an object. See {#koru/util.withId}`});
      api.property('globalId$', {info: `Used to assign a global id to an object`});
      api.property('ctx$', {info: `The {#koru/dom/ctx} of a HTML element`});
      api.property('endMarker$', {info: `Associate a start with an end; used with HTML elements`});
      api.property('stopGap$', {info: `A interim value for an object; used with model`});
      api.property('private$', {info: `Private values associated with an object`});
      api.property('test$', {info: `Test values associated with an object`});
      api.property('inspect$', {info: `Override the {#koru/util.inspect} value displayed`});
      api.property('error$', {info: `Used to hold errors on a [model](#koru/model/base-model)`});
      api.property('original$', {info: `store the original value on a [change](#koru/changes)`});

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
          'error$: Symbol(error$), '+
          'original$: Symbol(original$)'+
          '}'
      );
    });
  });
});
