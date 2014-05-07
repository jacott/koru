define(function (require, exports, module) {
  var WebSocketServer = require('ws').Server;
  var server = require('bart/web-server').server;

  var session = {
    wss: new WebSocketServer({server: server}),
    conns: {},
    sendAll: sendAll,
  };

  init(session);

  return session;
});

function init(session) {
  var sessCounter = 0;
  session.wss.on('connection', function(ws) {
    console.log('DEBUG new client ws:',ws.upgradeReq.headers, ws.upgradeReq.socket.remoteAddress);
    var sessId = '' + (++sessCounter);
    session.conns[sessId] = {
      ws: ws,
    };
    ws.on('close', function() {
      delete session.conns[sessId];
      console.log('DEBUG close client ', sessId);
    });
    ws.on('message', function(data, flags) {
      console.log('DEBUG sessId', sessId, data);
    });
  });
}

function sendAll(cmd, msg) {
  var conns = this.conns;
  for(var key in conns) {
    conns[key].ws.send(cmd+msg, function () {});
  }
}
