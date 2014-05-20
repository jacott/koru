requirejs.config({
  packages: [
    "bart/test",
  ],

  baseUrl: '/',
});

define(['module', 'bart/env', 'bart/client'], function (module, env) {
  env.onunload(module, 'reload');
});
