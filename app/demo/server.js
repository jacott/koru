define(function(require, exports, module) {
  var bootstrap = require('bootstrap');
  require('publish-all');
  var session = require('koru/session');
  var webServer = require('koru/web-server');

  require('koru/css/less-watcher');
  require('koru/server-rc');

  return function(env) {
    bootstrap();

    webServer.start();
    console.log('=> Ready');
  };
});
