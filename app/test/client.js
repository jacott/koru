requirejs.config({
  packages: [
    "koru/test", "koru/session",
  ],

  baseUrl: '/',
});

window.history.replaceState(null, document.title = 'Koru Test Mode', '/');

define(function(require, exports, module) {
  var env = require('koru/env');
  require('koru/session/main-client');

  env.onunload(module, 'reload');

  // load session with lowest priority
  require(['koru/session'], function (session) {
    session.connect();
  });
});
