window.requirejs = window.yaajs;

window.history.replaceState(null, document.title = 'Test Mode', '/');

define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru/main');

  require('koru/test/client');
  koru.onunload(module, 'reload');
});
