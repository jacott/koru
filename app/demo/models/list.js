define(function(require, exports, module) {
  const {BaseModel} = require('koru/model');

  class List extends BaseModel {
    authorize() {}
  }

  module.exports = List.define({
    module,
    fields: {
      name: 'text',
    },
  });
});
