window.requirejs = window.yaajs;

window.history.replaceState(null, document.title = 'Test Mode', '/');

define(function(require, exports, module) {
  const koru            = require('koru/main');

  require('koru/test/client');
  koru.onunload(module, 'reload');
});
