var WebSocketServer = require('ws').Server;

define(function (require, exports, module) {
  var env = require('../env');
  var util = require('../util');
  var server = require('../web-server').server;
  var message = require('./message');

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
      data = message.decodeMessage(data);
      var msgId = data[0];
      var func = session._rpcs[data[1]];
      try {
        if (! func)
          throw new env.Error(404, 'unknown method: ' + data[1]);

        var result = func.apply(this, data.slice(2));
        this.sendBinary('M', [msgId, 'r', result]);
      } catch(ex) {
        env.error(util.extractError(ex));
        this.sendBinary('M', [msgId, 'e', (ex.error && ex.reason ? ex.error + ',' + ex.reason : ex)]);
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
      var sessId = (++sessCounter).toString(36);
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
        conns[key].ws.send(cmd+msg);
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
