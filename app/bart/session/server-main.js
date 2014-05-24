var WebSocketServer = require('ws').Server;

define(function (require, exports, module) {
  var env = require('../env');
  var core = require('../core');
  var util = require('../util');
  var session = require('./main');
  var server = require('../web-server').server;
  var Connection = require('./server-connection');

  core.onunload(module, 'reload');

  var sessCounter = 0;

  util.extend(session, {
    wss: new WebSocketServer({server: server}),
    conns: {},
    sendAll: sendAll,
    versionHash: Date.now(),
    unload: unload,
    load: load,
    totalSessions: 0,
    rpc: function (name /*, args */) {
      session._rpcs[name].apply(util.thread, util.slice(arguments, 1));
    },

    // for testing
    _onConnection: onConnection,
    get _sessCounter() {return sessCounter},
  });

  session.provide('X', function (data) {this.engine = data});
  session.provide('L', function (data) {});
  session.provide('E', function (data) {
    session.remoteControl ?
      session.remoteControl.logHandle &&
      session.remoteControl.logHandle.call(this, data) :
      core.logger('INFO', this.engine, data);
  });
  session.provide('M', function (data) {
    var index = data.indexOf('[');
    var func = session._rpcs[data.slice(0,index).toString()];
    if (! func) {
      return core.info('unknown method: ' + data.slice(0,index).toString());
    }
    func.apply(this, JSON.parse(data.slice(index).toString()));
  });

  session.wss.on('connection', onConnection);

  function onConnection(ws) {
    var ugr = ws.upgradeReq;
    if ((ugr.socket.remoteAddress === '127.0.0.1') && !ugr.headers.hasOwnProperty('user-agent')) {
      session.remoteControl(ws);
      return;
    }
    ++session.totalSessions;
    core.info('New client ws:',session.totalSessions, ugr.headers['user-agent'], ugr.socket.remoteAddress);
    ws.on('close', function() {
      --session.totalSessions;
      if (sessId) {
        var conn = session.conns[sessId];
        conn && conn.closed();
        delete session.conns[sessId];
      }
      core.info('Close client', sessId);
    });
    var sessId = (++sessCounter).toString(16);
    var conn = session.conns[sessId] = new Connection(ws, sessId);
    ws.on('message', function (data, flags) {
      core.Fiber(function () {
        try {
          session._onMessage(conn, data);
        } catch(ex) {
          core.error(util.extractError(ex));
        }
      }).run();
    });

    ws.send('X'+session.versionHash);
  }

  function sendAll(cmd, msg) {
    var conns = this.conns;
    for(var key in conns) {
      conns[key].ws.send(cmd+msg, env.nullFunc);
    }
  }

  function load(id) {
    this.sendAll('L', id);
  }

  function unload(id) {
    env.unload(id);
    this.versionHash = Date.now();
    this.sendAll('U', this.versionHash + ':' + id);
  }

  return session;
});
