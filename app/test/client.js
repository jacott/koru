window.requirejs = window.yaajs
window.yaajs.config({
  packages: [
    "koru", "koru/test", "koru/session",
  ],

  baseUrl: '/',
});

window.history.replaceState(null, '', '/');

// register under two names
define("test/client", function (require, exports, module) {
  var koru = require('koru/main-client');
  koru.onunload(module, 'reload');
});

define(function(require, exports, module) {
  var koru = require('koru/main-client');
  var session = require('koru/session/main');

  document.title = 'Koru Test Mode';
  koru.onunload(module, 'reload');

  session.connect();
});
