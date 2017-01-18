window.requirejs = window.yaajs;

window.history.replaceState(null, '', '/');

define(function(require, exports, module) {
  const koru = require('koru');
  require('koru/test/client');

  document.title = 'Koru Test Mode';
  if (window.top) window.top.document.title = document.title;
  koru.onunload(module, 'reload');
});
