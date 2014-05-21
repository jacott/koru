requirejs.config({
  packages: [
    "bart/test",
  ],

  baseUrl: '/',
});

window.history.replaceState(null, document.title = 'Bart Test Mode', '/');


define(['module', 'bart/env', 'bart/client'], function (module, env) {
  env.onunload(module, 'reload');
});
