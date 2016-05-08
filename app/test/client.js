window.requirejs = window.yaajs
window.yaajs.config({
  packages: [
    "koru", "koru/test", "koru/session",
  ],

  baseUrl: '/',
});

window.history.replaceState(null, '', '/');

define(function(require, exports, module) {
  var koru = require('koru/main-client');
  require('koru/test/client');

  document.title = 'Koru Test Mode';
  if (window.top) window.top.document.title = document.title;
  koru.onunload(module, 'reload');
});
