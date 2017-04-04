const WebSocketServer = requirejs.nodeRequire('ws').Server;

define(function (require, exports, module) {
  const Random      = require('koru/random');
  const koru        = require('../main');
  const makeSubject = require('../make-subject');
  const util        = require('../util');
  const message     = require('./message');

  function webSocketServerFactory(session, execWrapper) {
    const Connection = require('./server-connection-factory')(session);

    koru.onunload(module, 'reload');

    let sessCounter = 0;
    const globalDictAdders = {};
    let _globalDict, _globalDictEncoded;
    let _preloadDict = message.newGlobalDict();

    globalDictAdders[module.id] = addToDictionary;

    util.merge(session, {
      execWrapper: execWrapper || koru.fiberConnWrapper,
      conns: {},
      sendAll: sendAll,
      versionHash: process.env.KORU_APP_VERSION || 'v'+Date.now(),
      unload: unload,
      load: load,
      totalSessions: 0,
      rpc(name, ...args) {
        return session._rpcs[name].apply(util.thread, args);
      },
      onConnection: onConnection,
      stop() {
        session.wss.close();
      },

      registerGlobalDictionaryAdder(module, adder) {
        globalDictAdders[module.id] = adder;
      },

      deregisterGlobalDictionaryAdder(module) {
        delete globalDictAdders[module.id];
      },

      addToDict: addToDict,

      get globalDict() {
        if (_globalDict) return _globalDict;
        return buildGlobalDict();
      },

      // for testing
      get _sessCounter() {return sessCounter},
      get _Connection() {return Connection},
      get _globalDictAdders() {return globalDictAdders},
    });

    function buildGlobalDict() {
      for(let name in globalDictAdders) {
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
      const msgId = data[0];
      const func = session._rpcs[data[1]];
      this.batchMessages();
      try {
        if (! func)
          throw new koru.Error(404, 'unknown method: ' + data[1]);

        util.thread.msgId = msgId;
        if (msgId.length > 17)
          util.thread.random = Random.create(msgId);
        const result = func.apply(this, data.slice(2));
        this.sendBinary('M', [msgId, 'r', result]);
        this.releaseMessages();
      } catch(ex) {
        this.abortMessages();
        if (ex.error) {
          this.sendBinary('M', [msgId, 'e', ex.error, ex.reason]);
        } else {
          koru.error(util.extractError(ex));
          this.sendBinary('M', [msgId, 'e', ex.toString()]);
        }
      }
    });

    function onConnection(ws) {
      const ugr = ws.upgradeReq;

      let _remoteAddress = ugr.socket.remoteAddress;
      const remoteAddress = /127\.0\.0\.1/.test(_remoteAddress) ?
              ugr.headers['x-real-ip'] || _remoteAddress : _remoteAddress;

      if (session.connectionIntercept)
        session.connectionIntercept(newSession, ws, remoteAddress);
      else
        newSession();

      function newSession(wrapOnMessage) {
        ++session.totalSessions;
        const sessId = (++sessCounter).toString(36);
        const conn = session.conns[sessId] = new Connection(ws, sessId, () => {
          ws.close();
          const conn = session.conns[sessId];
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

        const onMessage = conn.onMessage.bind(conn);
        ws.on('message', wrapOnMessage ? wrapOnMessage(onMessage) : onMessage);

        conn.sendBinary('X', [2, session.versionHash, globalDictEncoded()]);
        koru.info('New client ws:', sessId, session.totalSessions,
                  conn.engine, remoteAddress+':'+conn.remotePort);
        session.countNotify.notify(conn, true);
        return conn;
      }
    }

    function sendAll(cmd, msg) {
      const conns = this.conns;
      for(let key in conns) {
        conns[key].send(cmd, msg);
      }
    }

    function load(id) {
      this.sendAll('L', id);
    }

    function unload(id) {
      const {ctx} = requirejs.module;
      id = ctx.normalizeId(id);

      const mod = ctx.modules[id];
      if (mod) {
        mod.unload();
        this.versionHash = 'v'+Date.now();
      }
      this.sendAll('U', this.versionHash + ':' + id);
    }

    function addToDictionary(adder) {
      for (let name in session._rpcs) {
        adder(name);
      }
    }

    return session;
  };

  module.exports = webSocketServerFactory;
});
