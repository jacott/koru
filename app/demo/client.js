requirejs.config({
  packages: ['bart/model'],

  baseUrl: "/demo",

  paths: {
    bart: '../bart',
  },
});

define([
  'module', 'bart/env', 'bart/ui/route', 'ui/todos',
  'bart/session/subscribe', 'bart/dom',
  'bart/session/client-main'
], function (
  module, env, Route, todos,
  subscribe, Dom
) {
         // reload me if unloaded
  env.onunload(module, function () {
    subHandle && subHandle.stop();
    subHandle = null;
    require([module.id], function () {});
  });

  Route.title = 'Todos';

  window.addEventListener('popstate', function (event) {
    Route.pageChanged();
  });

  var subHandle = subscribe('all', function () {
    Dom.removeClass(document.body, 'loading');
    todos.start();
  });
});
