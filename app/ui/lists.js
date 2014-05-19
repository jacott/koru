define(function(require, exports, module) {
  var Model = require('bart/model');
  var Dom = require('bart/dom');
  require('bart/ui/each');

  var Tpl = Dom.newTemplate(require('bart/html!./lists'));

  Tpl.$helpers({
    lists: function (callback) {
      callback.render({
        model: Model.List,
        sort: "name",
      });
    },
  });

  return Tpl;
});
