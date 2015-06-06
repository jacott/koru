requirejs.config({
  packages: [
    "koru", "koru/test", "koru/session",
  ],

  baseUrl: '/',
});

window.history.replaceState(null, '', '/');

document.title = 'Koru Test Mode';

define(function(require, exports, module) {
  var koru = require('koru/main-client');
  var session = require('koru/session/main');

  koru.onunload(module, 'reload');

  session.connect();
});
