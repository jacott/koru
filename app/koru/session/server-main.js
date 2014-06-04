var WebSocketServer = require('ws').Server;

define(function (require, exports, module) {
  var env = require('../env');
  var util = require('../util');
  var server = require('../web-server').server;

  return function (session) {
    var Connection = require('./server-connection')(session);

    env.onunload(module, 'reload');

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
        return session._rpcs[name].apply(util.thread, util.slice(arguments, 1));
      },

      // for testing
      _onConnection: onConnection,
      get _sessCounter() {return sessCounter},
    });

    session.provide('X', function (data) {this.engine = data.slice(1)});
    session.provide('L', function (data) {
      env.logger('INFO', this.engine, data);
    });
    session.provide('E', function (data) {
      session.remoteControl && session.remoteControl.logHandle ?
        session.remoteControl.logHandle.call(this, data) :
        env.logger('INFO', this.engine, data);
    });
    session.provide('M', function (data) {
      var index = data.indexOf('|');
      if (index !== -1) {
        var msgId = data.slice(0, index);

        var aIdx = data.indexOf('[', index + 1);
        var func = session._rpcs[data.slice(index + 1, aIdx).toString()];
      }
      if (! func) {
        return env.info('unknown method: ' + data.slice(0,index).toString());
      }
      try {
        var result = func.apply(this, JSON.parse(data.slice(aIdx).toString()));
        this.ws.send('M'+msgId+'|r'+ (result ? JSON.stringify(result) : ''));
      } catch(ex) {
        env.error(util.extractError(ex));
        this.ws.send('M'+msgId+'|e' + (ex.error && ex.reason ? ex.error + ',' + ex.reason : ex));
      }
    });

    session.wss.on('connection', onConnection);

    function onConnection(ws) {
      var ugr = ws.upgradeReq;
      if ((ugr.socket.remoteAddress === '127.0.0.1') && !ugr.headers.hasOwnProperty('user-agent')) {
        session.remoteControl(ws);
        return;
      }
      ++session.totalSessions;
      env.info('New client ws:',session.totalSessions, ugr.headers['user-agent'], ugr.socket.remoteAddress);
      var sessId = (++sessCounter).toString(16);
      var conn = session.conns[sessId] = new Connection(ws, sessId, function() {
        ws.close();
        --session.totalSessions;
        if (sessId) {
          var conn = session.conns[sessId];
          conn && conn.closed();
          delete session.conns[sessId];
        }
        env.info('Close client', sessId);
      });
      ws.on('message', conn.onMessage.bind(conn));

      ws.send('X1'+session.versionHash);
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
  };
});
