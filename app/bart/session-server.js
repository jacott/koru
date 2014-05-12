define(function (require, exports, module) {
  var WebSocketServer = require('ws').Server;
  var core = require('./core');
  var util = require('./util');
  var session = require('./session');
  var server = require('./web-server').server;

  core.onunload(module, 'reload');

  init();

  return session;

  function init() {
    util.extend(session, {
      wss: new WebSocketServer({server: server}),
      conns: {},
      sendAll: sendAll,
      versionHash: Date.now(),
      unload: unload,
      load: load,
    });

    session.provide('X', function (data) {this.engine = data});
    session.provide('L', function (data) {});
    session.provide('E', function (data) {
      session.remoteControl ?
        session.remoteControl.logHandle.call(this, data) :
        core.logger('INFO', this.engine, data);
    });

    var sessCounter = 0;
    session.totalSessions = 0;
    session.wss.on('connection', function(ws) {
      var ugr = ws.upgradeReq;
      if ((ugr.socket.remoteAddress === '127.0.0.1') && !ugr.headers.hasOwnProperty('user-agent')) {
        session.remoteControl(ws);
        return;
      }
      ++session.totalSessions;
      core.info('New client ws:',session.totalSessions, ugr.headers['user-agent'], ugr.socket.remoteAddress);
      ws.on('close', function() {
        --session.totalSessions;
        if (sessId) delete session.conns[sessId];
        core.info('Close client', sessId);
      });
      var sessId = '' + (++sessCounter);
      var conn = session.conns[sessId] = {
        ws: ws,
      };
      ws.on('message', function (data, flags) {
        session._onMessage(conn, data);
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
});
