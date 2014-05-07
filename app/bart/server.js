define(function (require, exports, module) {
  var webserver = require('bart/web-server');
  var session = require('bart/session-server');
  require('bart/server-cli');

  require(['server-cmd'], function () {});
});
