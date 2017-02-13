window.requirejs = window.yaajs;
define(function(require, exports, module) {
  const koru    = require('koru/main');
  const startup = require('startup-client');

  require(module.config().extraRequires || [], function () {
    startup.start(module.config().extraRequires);
  });
});
