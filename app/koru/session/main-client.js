/*global WebSocket */

define(function (require, exports, module) {
  const util                   = require('koru/util');
  const koru                   = require('../main');
  const webSocketSenderFactory = require('./web-socket-sender-factory');

  koru.onunload(module, 'reload');

  const sessionClientFactory = (session, state=require('./state')) => {
    session._url = function () {
      const location = koru.getLocation();

      return location.protocol.replace(/^http/,'ws')+
        `//${location.host}/${this._pathPrefix()}`;
    };
    session._pathPrefix = function (params) {
      const path = `ws/${koru.PROTOCOL_VERSION}/${this.version || 'dev'}/${this.hash || ''}`;
      const search = (
        this.dictHash === null ? '' : 'dict='+this.dictHash
      )+(
        params !== undefined && this.dictHash !== null ? '&' : ''
      )+(
        params === undefined ? '' :
          typeof params === 'string' ? params : util.mapToSearchStr(params));

      return search === '' ? path : `${path}?${search}`;
    };

    session.newWs = function () {return new WebSocket(this._url())};
    return webSocketSenderFactory(session, state);
  };

  module.exports = sessionClientFactory;
});
