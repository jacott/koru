var WebSocketServer = requirejs.nodeRequire('ws').Server;

define(function (require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var message = require('./message');
  var IdleCheck = require('../idle-check').singleton;
  var makeSubject = require('../make-subject');
  var BatchMessage = require('./batch-message');

  return function (session) {
    var Connection = require('./server-connection')(session);

    koru.onunload(module, 'reload');

    var sessCounter = 0;
    var globalDictAdders = {};
    globalDictAdders[module.id] = addToDictionary;

    util.extend(session, {
      conns: {},
      sendAll: sendAll,
      versionHash: process.env['KORU_APP_VERSION'] || ''+Date.now(),
      unload: unload,
      load: load,
      totalSessions: 0,
      rpc: function (name /*, args */) {
        return session._rpcs[name].apply(util.thread, util.slice(arguments, 1));
      },
      onConnection: onConnection,
      stop: function () {
        session.wss.close();
      },

      registerGlobalDictionaryAdder: function (module, adder) {
        globalDictAdders[module.id] = adder;
      },

      deregisterGlobalDictionaryAdder: function (module) {
        delete globalDictAdders[module.id];
      },

      addToDict: addToDict,

      get globalDict() {
        if (_globalDict) return _globalDict;
        return buildGlobalDict();
      },

      batchMessages: function () {
        util.thread.batchMessage = new BatchMessage(this);
      },
      releaseMessages: function () {
        util.thread.batchMessage.release();
        util.thread.batchMessage = null;
      },
      abortMessages: function () {
        util.thread.batchMessage.abort();
        util.thread.batchMessage = null;
      },

      // for testing
      get _sessCounter() {return sessCounter},
      get _Connection() {return Connection},
      get _globalDictAdders() {return globalDictAdders},
    });

    var _globalDict, _globalDictEncoded;
    var _preloadDict = message.newGlobalDict();


    function buildGlobalDict() {
      for(var name in globalDictAdders) {
        globalDictAdders[name](addToDict);
      }
      _globalDict = _preloadDict;
      _preloadDict = null;

      message.finalizeGlobalDict(_globalDict);
      _globalDictEncoded = new Uint8Array(message.encodeDict(_globalDict, []));
      return _globalDict;
    }

    function addToDict(word) {
      _preloadDict && message.addToDict(_preloadDict, word);
    }

    function globalDictEncoded() {
      return session.globalDict && _globalDictEncoded;
    }

    makeSubject(session.countNotify = {});

    session.provide('X', function (data) {
      // TODO ensure protocol version is compatible
    });
    session.provide('H', function (data) {
      this.send('K');
    });
    session.provide('M', function (data) {
      var msgId = data[0];
      var func = session._rpcs[data[1]];
      try {
        session.batchMessages();
        if (! func)
          throw new koru.Error(404, 'unknown method: ' + data[1]);

        var result = func.apply(this, data.slice(2));
        this.sendBinary('M', [msgId, 'r', result]);
        session.releaseMessages();
      } catch(ex) {
        session.abortMessages();
        if (ex.error) {
          this.sendBinary('M', [msgId, 'e', ex.error, ex.reason]);
        } else {
          koru.error(util.extractError(ex));
          this.sendBinary('M', [msgId, 'e', ex.toString()]);
        }
      }
    });

    function onConnection(ws) {
      var ugr = ws.upgradeReq;

      var remoteAddress = ugr.socket.remoteAddress;
      if (/127\.0\.0\.1/.test(remoteAddress))
        remoteAddress = ugr.headers['x-real-ip'] || remoteAddress;

      if (session.connectionIntercept)
        session.connectionIntercept(newSession, ws, remoteAddress);
      else
        newSession();

      function newSession(wrapOnMessage) {
        ++session.totalSessions;
        var sessId = (++sessCounter).toString(36);
        var conn = session.conns[sessId] = new Connection(ws, sessId, function() {
          ws.close();
          conn = session.conns[sessId];
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

        var onMessage = conn.onMessage.bind(conn);
        ws.on('message', wrapOnMessage ? wrapOnMessage(onMessage) : onMessage);

        conn.sendBinary('X', [1, session.versionHash, globalDictEncoded()]);
        koru.info('New client ws:', sessId, session.totalSessions, conn.engine, remoteAddress+':'+conn.remotePort);
        session.countNotify.notify(conn, true);

      }
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
      var ctx = requirejs.module.ctx;
      id = ctx.normalizeId(id);

      var mod = ctx.modules[id];
      if (mod) {
        mod.unload();
        this.versionHash = ''+Date.now();
      }
      this.sendAll('U', this.versionHash + ':' + id);
    }

    function addToDictionary(adder) {
      for (var name in session._rpcs) {
        adder(name);
      }
    }

    return session;
  };
});
