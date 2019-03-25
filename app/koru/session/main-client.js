define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const State           = require('koru/session/state');
  const webSocketSenderFactory = require('koru/session/web-socket-sender-factory');
  const util            = require('koru/util');

  koru.onunload(module, 'reload');

  return (session, state=State)=>{
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

    session.newWs = function () {return new window.WebSocket(this._url())};
    return webSocketSenderFactory(session, state);
  };
});
