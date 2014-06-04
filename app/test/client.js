requirejs.config({
  packages: [
    "koru/test",
  ],

  baseUrl: '/',
});

window.history.replaceState(null, document.title = 'Koru Test Mode', '/');

define(function(require, exports, module) {
  var env = require('koru/client');
  var session = require('koru/session/main');

  env.onunload(module, 'reload');

  session.connect();
});
