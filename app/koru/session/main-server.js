define((require)=>{
  'use strict';
  const koru            = require('koru');
  const server          = require('../web-server').server;
  const webSocketServerFactory = require('./web-socket-server-factory');
  const WebSocket       = requirejs.nodeRequire('ws');

  return session =>{
    webSocketServerFactory(session);

    session.provide('L', data =>{
      koru.logger('C', data);
    });
    session.provide('E', data =>{
      if (koru.clientErrorConvert !== undefined)
        data = koru.clientErrorConvert(data);
      koru.logger('C', data);
    });

    session.connectionIntercept = (newSession, ws, ugr, remoteAddress)=>{
      if (/127\.0\.0\.1/.test(remoteAddress) && ugr.url === '/rc') {
        session.remoteControl && session.remoteControl(ws);
        return;
      }
      newSession();
    };

    session.wss = new (session._wssOverride || WebSocket.Server)({
      server: server, perMessageDeflate: false}),

    session.wss.on('connection', session.onConnection);

    return session;
  };
});
