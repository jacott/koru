define((require, exports, module) => {
  'use strict';
  const Val             = require('koru/model/validation');

  return {validate: (doc, field, validator) => validator.call(doc, field)};
});
