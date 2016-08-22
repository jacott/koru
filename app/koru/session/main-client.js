/*global WebSocket, KORU_APP_VERSION */

define(function (require, exports, module) {
  const koru                   = require('../main');
  const webSocketSenderFactory = require('./web-socket-sender-factory');

  koru.onunload(module, 'reload');

  function sessionClientFactory(session, state=require('./state')) {
    session._url = url;
    session.newWs = function () {
      return new WebSocket(session._url());
    };
    return webSocketSenderFactory(session, state);
  };
  sessionClientFactory._url = url;

  function url() {
    var location = koru.getLocation();
    return location.protocol.replace(/^http/,'ws')+'//' + location.host+'/ws';
  }

  module.exports = sessionClientFactory;
});
