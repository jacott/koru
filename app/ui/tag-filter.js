define(function(require, exports, module) {
  var Model = require('bart/model');
  var Dom = require('bart/dom');
  require('bart/ui/each');

  var Tpl = Dom.newTemplate(require('bart/html!./tag-filter'));

  Tpl.$helpers({
    tags: function () {

    },
  });


  return Tpl;
});
