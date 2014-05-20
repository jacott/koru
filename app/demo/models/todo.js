define(function(require, exports, module) {
  var Model = require('bart/model');

  var List = require('./list');

  var model = Model.define('Todo');

  model.defineFields({
    list_id: 'belongs_to',
    text: 'text',
    timestamp: 'number',
    tags: 'has-many',
    done: 'boolean',
  });

  return model;
});
