define(function(require, exports, module) {
  var Model = require('bart/model');
  var Dom = require('bart/dom');
  require('bart/ui/each');
  var route = require('bart/ui/route');

  var Tpl = Dom.newTemplate(require('bart/html!ui/todos'));

  Tpl.$extend({
    onEntry: function () {
      // document.body.appendChild(Tpl.$autoRender(AppModel.User.me()));
    },

    onExit: function () {
      // Bart.removeId('Admin');
    },

  });

  route.root.addTemplate(Tpl, {path: "/"});

  return Tpl;
});
