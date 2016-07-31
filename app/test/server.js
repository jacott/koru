define(function(require) {
  require('koru/server');
  require('koru/session');
  require('koru/css/less-watcher');
  require('koru/server-rc');
  var webServer = require('koru/web-server');
  var koru = require('koru/main');
  require('koru/test/server');
  require('koru/test/api');

  return function () {
    webServer.start();
    console.log('=> Ready');
  };
});
