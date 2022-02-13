define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const HttpRequest     = require('koru/session/http-request');
  const WebServer       = require('koru/web-server');
  const webSocketServerFactory = require('./web-socket-server-factory');
  const WebSocket       = requirejs.nodeRequire('ws');

  const server = WebServer.server;

  return (session) => {
    webSocketServerFactory(session);

    session.provide('L', (data) => {
      koru.logger('L', data);
    });
    session.provide('E', async (data) => {
      if (koru.clientErrorConvert !== undefined) {
        data = await koru.clientErrorConvert(data);
      }
      koru.logger('E', data);
    });

    session.connectionIntercept = (newSession, ws, ugr, remoteAddress) => {
      if (HttpRequest.isLocalAddress(remoteAddress) && ugr.url === '/rc') {
        session.remoteControl?.(ws);
        return;
      }
      return newSession();
    };

    const config = module.config();

    if (! config.noWss) {
      session.wss = new WebSocket.Server({
        server, perMessageDeflate: false}),

      session.wss.on('connection', session.onConnection);
    }

    return session;
  };
});
