requirejs.config({
  packages: ['bart/model'],
});

define(['module', 'bart/env', 'bart/session/client-main', 'bootstrap'], function (module, env) {
  env.onunload(module, 'reload');

  require(['ui/todos'], function() {});
});
