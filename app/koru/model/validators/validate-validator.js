define((require, exports, module) => {
  'use strict';
  const Val             = require('koru/model/validation');

  return {
    validate(doc, field, validator) {
      const ans = validator.call(doc, field);
      if (ans instanceof Promise) {
        return ans.then((ans) => {Val.addError(doc, field, ans)});
      }
      if (ans !== void 0) {
        Val.addError(doc, field, ans);
      }
    },
  };
});
