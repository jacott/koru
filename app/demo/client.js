requirejs.config({
  packages: ['koru/model'],

  baseUrl: "/",

  paths: {
    koru: '../koru',
  },
});

define([
  'module', 'koru/env', 'koru/ui/route', 'ui/todos',
  'koru/session/subscribe', 'koru/dom',
  'koru/session/main'
], function (
  module, env, Route, todos,
  subscribe, Dom,
  session
) {
         // reload me if unloaded
  env.onunload(module, function () {
    subHandle && subHandle.stop();
    subHandle = null;
    require([module.id], function () {});
  });

  session.connect();

  Route.title = 'Todos';

  window.addEventListener('popstate', function (event) {
    Route.pageChanged();
  });

  var subHandle = subscribe('all', function () {
    Dom.removeClass(document.body, 'loading');
    todos.start();
  });
});
