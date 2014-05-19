define(function(require, exports, module) {
  var core = require('bart/core');
  require('bart/ui/each');
  var Model = require('bart/model');

  core.onunload(module, unload);

  var Dom = require('bart/dom');
  Dom.newTemplate(require('bart/html!ui/todos'));

  var Tpl = Dom.Todos;

  Tpl.TagFilter.$helpers({
    tags: function () {

    },
  });

  Tpl.Lists.$helpers({
    lists: function (callback) {
      callback.render({
        model: Model.List,
      });
    },
  });


  document.body.appendChild(Tpl.TagFilter.$autoRender({}));

  document.body.appendChild(Tpl.$autoRender({}));

  document.body.appendChild(Tpl.Lists.$autoRender({}));

  function unload() {
    Dom.removeId('main-pane');
    Dom.removeId('top-tag-filter');
    Dom.removeId('Lists');

    // reload
    require(['./todos'], function () {});
  }
});
