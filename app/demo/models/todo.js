define(function(require, exports, module) {
  const {BaseModel} = require('koru/model');
  const List        = require('./list');

  class Todo extends BaseModel {
    authorize() {}
  }

  module.exports = Todo.$init({
    module,
    fields: {
      list_id: 'belongs_to',
      text: 'text',
      timestamp: 'bigint',
      tags: 'text[]',
      done: 'boolean',
    },
  });
});
