requirejs.config({
  packages: ['koru', 'koru/model', 'koru/session'],

  baseUrl: "/",

  paths: {
    koru: '../koru',
  },
});

define([
  'module', 'koru', 'koru/ui/route', 'ui/todos',
  'koru/session/subscribe', 'koru/dom',
  'koru/session', 'publish-all',
], function (
  module, koru, Route, todos,
  subscribe, Dom,
  session
) {
         // reload me if unloaded
  koru.onunload(module, function () {
    subHandle && subHandle.stop();
    subHandle = null;
    require([module.id], function () {});
  });

  session.connect();

  subscribe = subscribe(session);

  Route.title = 'Todos';

  window.addEventListener('popstate', function (event) {
    Route.pageChanged();
  });

  var subHandle = subscribe('all', function () {
    Dom.removeClass(document.body, 'loading');
    todos.start();
  });
});
