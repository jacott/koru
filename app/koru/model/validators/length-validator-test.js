define(function (require, exports, module) {
  const TH              = require('koru/test-helper');
  const validation      = require('../validation');
  const sut             = require('./length-validator');

  const {error$} = require('koru/symbols');

  TH.testCase(module, ({test})=>{
    test("too long", ()=>{
      const doc = {name: '123'};
      sut.maxLength.call(validation, doc,'name', 2);

      assert(doc[error$]);
      assert.equals(doc[error$]['name'],[["too_long", 2]]);
    });

    test("missing", ()=>{
      const doc = {name: ''};
      sut.maxLength.call(validation, doc,'name', 2);

      refute(doc[error$]);
    });

    test("not too long", ()=>{
      const doc = {name: '123'};
      sut.maxLength.call(validation, doc,'name', 3);

      refute(doc[error$]);
    });
  });
});
