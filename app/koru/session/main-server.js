var WebSocketServer = requirejs.nodeRequire('ws').Server;

define(function (require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var server = require('../web-server').server;
  var message = require('./message');
  var IdleCheck = require('../idle-check').singleton;
  var makeSubject = require('../make-subject');

  return function (session) {
    var Connection = require('./server-connection')(session);

    koru.onunload(module, 'reload');

    var sessCounter = 0;

    util.extend(session, {
      wss: new (session._wssOverride || WebSocketServer)({server: server, perMessageDeflate: false}),
      conns: {},
      sendAll: sendAll,
      versionHash: process.env['KORU_APP_VERSION'] || Date.now(),
      unload: unload,
      load: load,
      totalSessions: 0,
      rpc: function (name /*, args */) {
        return session._rpcs[name].apply(util.thread, util.slice(arguments, 1));
      },
      stop: function (func) {
        this.wss.close();
        IdleCheck.waitIdle(func);
      },

      // for testing
      _onConnection: onConnection,
      get _sessCounter() {return sessCounter},
      get _Connection() {return Connection},
    });

    makeSubject(session.countNotify = {});

    session.provide('X', function (data) {
      // TODO ensure protocol version is compatible
    });
    session.provide('H', function (data) {
      this.send('K');
    });
    session.provide('L', function (data) {
      koru.logger('INFO', this.engine, data);
    });
    session.provide('E', function (data) {
      session.remoteControl && session.remoteControl.logHandle ?
        session.remoteControl.logHandle.call(this, data) :
        koru.logger('INFO', this.sessId, this.engine, data);
    });
    session.provide('M', function (data) {
      data = message.decodeMessage(data);
      var msgId = data[0];
      var func = session._rpcs[data[1]];
      try {
        if (! func)
          throw new koru.Error(404, 'unknown method: ' + data[1]);

        var result = func.apply(this, data.slice(2));
        this.sendBinary('M', [msgId, 'r', result]);
      } catch(ex) {
        if (ex.error) {
          this.sendBinary('M', [msgId, 'e', ex.error, ex.reason]);
        } else {
          koru.error(util.extractError(ex));
          this.sendBinary('M', [msgId, 'e', ex.toString()]);
        }
      }
    });

    session.wss.on('connection', onConnection);

    function onConnection(ws) {
      var ugr = ws.upgradeReq;

      var remoteAddress = ugr.socket.remoteAddress;
      if (/127\.0\.0\.1/.test(remoteAddress))
        remoteAddress = ugr.headers['x-real-ip'] || remoteAddress;

      if (/127\.0\.0\.1/.test(remoteAddress) && ugr.url === '/rc') {
        session.remoteControl && session.remoteControl(ws);
        return;
      }
      ++session.totalSessions;
      var sessId = (++sessCounter).toString(36);
      var conn = session.conns[sessId] = new Connection(ws, sessId, function() {
        ws.close();
        var conn = session.conns[sessId];
        if (conn) {
          --session.totalSessions;
          delete session.conns[sessId];
          session.countNotify.notify(conn, false);
        }
        koru.info('Close client', sessId, session.totalSessions);
      });
      conn.engine = util.browserVersion(ugr.headers['user-agent']||'');
      conn.remoteAddress = remoteAddress;
      conn.remotePort = ugr.socket.remotePort;

      ws.on('message', conn.onMessage.bind(conn));

      conn.send('X1', session.versionHash);
      koru.info('New client ws:', sessId, session.totalSessions, conn.engine, remoteAddress+':'+conn.remotePort);
      session.countNotify.notify(conn, true);
    }

    function sendAll(cmd, msg) {
      var conns = this.conns;
      for(var key in conns) {
        conns[key].send(cmd, msg);
      }
    }

    function load(id) {
      this.sendAll('L', id);
    }

    function unload(id) {
      if (requirejs.defined(id)) {
        koru.unload(id);
        this.versionHash = Date.now();
      }
      this.sendAll('U', this.versionHash + ':' + id);
    }

    return session;
  };
});
