define(function(require, exports, module) {
  var Model = require('bart/model');

  var model = Model.define('List');

  model.defineFields({
    name: 'text',
  });

  return model;
});
