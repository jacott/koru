requirejs.config({
  packages: ['bart/model'],

  baseUrl: "/demo",

  paths: {
    bart: '../bart',
  },
});

define([
  'module', 'bart/env', 'bart/ui/route', 'ui/todos',
  'bart/session/client-main', 'bootstrap'
], function (module, env, Route, todos) {
  // reload me if unloaded
  env.onunload(module, function () {require([module.id], function () {})});

  Route.title = 'Todos';

  window.addEventListener('popstate', function (event) {
    Route.pageChanged();
  });

  todos.start();
});
