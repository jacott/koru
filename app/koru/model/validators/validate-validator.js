define((require, exports, module) => {
  'use strict';
  const Val             = require('koru/model/validation');

  return {
    validate: (doc, field, validator) => ifPromise(
      validator.call(doc, field), (ans) => {ans !== void 0 && Val.addError(doc, field, ans)}),
  };
});
