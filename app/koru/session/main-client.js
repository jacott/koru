/*global WebSocket, KORU_APP_VERSION */

define(function (require, exports, module) {
  const koru                   = require('../main');
  const webSocketSenderFactory = require('./web-socket-sender-factory');

  koru.onunload(module, 'reload');

  const sessionClientFactory = (session, state=require('./state')) => {
    session._url = function () {
      const location = koru.getLocation();

      return location.protocol.replace(/^http/,'ws')+
        `//${location.host}/${this._pathPrefix()}`;
    };
    session._pathPrefix = function () {
      return `ws/${koru.PROTOCOL_VERSION}/${this.version || 'dev'}/${this.hash || ''}`;
    };

    session.newWs = function () {return new WebSocket(this._url())};
    return webSocketSenderFactory(session, state);
  };

  module.exports = sessionClientFactory;
});
