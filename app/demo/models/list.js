define(function(require, exports, module) {
  const {BaseModel} = require('koru/model');

  class List extends BaseModel {
    authorize() {}
  }

  module.exports = List.$init({
    module,
    fields: {
      name: 'text',
    },
  });
});
