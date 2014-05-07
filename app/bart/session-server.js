var core;

define(function (require, exports, module) {
  var WebSocketServer = require('ws').Server;
  var server = require('./web-server').server;

  core = require('./core');
  core.onunload(module, 'reload');

  var session = {
    wss: new WebSocketServer({server: server}),
    conns: {},
    sendAll: sendAll,
    versionHash: Date.now(),
    unload: unload,
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
    ws.send('X'+session.versionHash);
  });
}

function sendAll(cmd, msg) {
  var conns = this.conns;
  for(var key in conns) {
    conns[key].ws.send(cmd+msg, function () {});
  }
}

function unload(id) {
  core.unload(id);
  this.versionHash = Date.now();
  this.sendAll('U', this.versionHash + ':' + id);
}
