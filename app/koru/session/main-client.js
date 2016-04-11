/*global WebSocket, KORU_APP_VERSION */

define(function (require, exports, module) {
  var koru = require('../main');
  var sessState = require('./state');
  var WebSocketSenderFactory = require('./web-socket-sender-factory');

  koru.onunload(module, 'reload');

  function Constructor(sessState) {
    return function (session) {
      session._url = url;
      session.newWs = function () {
        return new WebSocket(session._url());
      };
      return WebSocketSenderFactory(session, sessState);
    };
  }

  module.exports = exports = Constructor(sessState);
  exports._url = url;

  function url() {
    var location = koru.getLocation();
    return location.protocol.replace(/^http/,'ws')+'//' + location.host+'/ws';
  }

  exports.__init__ = Constructor;
});
