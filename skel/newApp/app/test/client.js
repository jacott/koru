window.requirejs = window.yaajs;

window.history.replaceState(null, document.title = 'Test Mode', '/');

define(function(require, exports, module) {
  var koru = require('koru/main');
  require('koru/test/client');
  koru.onunload(module, 'reload');
});
