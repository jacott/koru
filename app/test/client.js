requirejs.config({
  packages: [
    "koru/test", "koru/session",
  ],

  baseUrl: '/',
});

window.history.replaceState(null, document.title = 'Koru Test Mode', '/');

define(function(require, exports, module) {
  var env = require('koru/env');
  var session = require('koru/session/main');

  env.onunload(module, 'reload');

  session.connect();
});
