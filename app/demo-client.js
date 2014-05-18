requirejs.config({
  packages: [
    "bart/test",
  ],
});

define(['module', 'bart/env', 'bart/client'], function (module, env) {
  env.onunload(module, 'reload');
});
