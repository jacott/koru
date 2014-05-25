define(function(require, exports, module) {
  var Model = require('koru/model');

  var model = Model.define(module, {
    authorize: function () {
    },
  });

  model.defineFields({
    name: 'text',
  });

  return model;
});
