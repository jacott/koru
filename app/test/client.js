requirejs.config({
  packages: [
    "koru/test",
  ],

  baseUrl: '/',
});

window.history.replaceState(null, document.title = 'Koru Test Mode', '/');


define(['module', 'koru/env', 'koru/client'], function (module, env) {
  env.onunload(module, 'reload');
});
