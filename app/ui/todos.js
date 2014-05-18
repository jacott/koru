define(function(require, exports, module) {
  var core = require('bart/core');

  core.onunload(module, unload);

  var Dom = require('bart/dom');
  Dom.newTemplate(require('bart/html!ui/todos'));

  var Tpl = Dom.Todos;

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
