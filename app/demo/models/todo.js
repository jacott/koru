define(function(require, exports, module) {
  var Model = require('koru/model');

  var List = require('./list');

  var model = Model.define(module, {
    authorize: function () {
    },
  });

  model.defineFields({
    list_id: 'belongs_to',
    text: 'text',
    timestamp: 'number',
    tags: 'text[]',
    done: 'boolean',
  });

  return model;
});
