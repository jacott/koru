window.requirejs = window.yaajs;
define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru/main');
  const startup         = require('startup-client');

  require(module.config().extraRequires || [], ()=>{
    startup.start(module.config().extraRequires);
  });
});
