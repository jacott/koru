define(function(require, exports, module) {
  var Model = require('bart/model');

  var List = require('./list');

  var model = Model.define('Todo');

  model.defineFields({
    list_id: 'belongs_to',
    text: 'text',
    timestamp: 'timestamp',
    tags: 'has-many',
  });

  return model;
});
