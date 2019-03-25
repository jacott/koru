window.requirejs = window.yaajs;

window.history.replaceState(null, '', '/');

define((require, exports, module)=>{
  'use strict';
  require('koru/test/client');

  document.title = 'Koru Test Mode';
  if (window.top) window.top.document.title = document.title;
});
