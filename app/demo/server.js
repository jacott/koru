define(function(require, exports, module) {
  var bootstrap = require('bootstrap');
  require('publish-all');
  var server = require('koru/server');
  var session = require('koru/session');
  require('koru/css/less-watcher');
  require('koru/server-rc');

  return function(env) {
    bootstrap();
  };
});
