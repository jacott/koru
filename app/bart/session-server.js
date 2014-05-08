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
    load: load,
  };

  init(session);

  return session;
});

function init(session) {
  var sessCounter = 0;
  session.wss.on('connection', function(ws) {
    var ugr = ws.upgradeReq;
    console.log('DEBUG new client ws:',ugr.headers, ugr.socket.remoteAddress);
    if ((ugr.socket.remoteAddress === '127.0.0.1') && !ugr.headers.hasOwnProperty('user-agent')) {
      session.remoteControl(ws);
      return;
    }
    var sessId = '' + (++sessCounter);
    session.conns[sessId] = {
      ws: ws,
    };
    ws.on('close', function() {
      delete session.conns[sessId];
      console.log('DEBUG close client ', sessId);
    });
    var engine;
    ws.on('message', function(data, flags) {
      var type = data.slice(0,1);
      data = data.slice(1);
      switch(type) {
      case 'X':
        engine = data;
        return;
      case 'L':
        if (session.logHandle) {
          session.logHandle(engine, data);
          return;
        }
        break;
      case 'T':
        if (session.testHandle) {
          session.testHandle(engine, data);
          return;
        }
        break;
      }
      console.log('DEBUG msg', type, sessId, data);
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

function load(id) {
  this.sendAll('L', id);
}

function unload(id) {
  core.unload(id);
  this.versionHash = Date.now();
  this.sendAll('U', this.versionHash + ':' + id);
}
