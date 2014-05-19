requirejs.config({
  packages: ['bart/model'],
});

define(['module', 'bart/env', 'ui/todos', 'bart/session/client-main', 'bootstrap'], function (module, env, todos) {
  // reload me if unloaded
  env.onunload(module, function () {require([module.id], function () {})});

  todos.start();
});
