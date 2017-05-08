define(function (require, exports, module) {
  const Random          = require('koru/random');
  const koru            = require('../main');
  const makeSubject     = require('../make-subject');
  const util            = require('../util');
  const message         = require('./message');
  const WebSocketServer = requirejs.nodeRequire('ws').Server;

  function webSocketServerFactory(session, execWrapper) {
    const Connection = require('./server-connection-factory')(session);

    koru.onunload(module, 'reload');

    let sessCounter = 0;
    const globalDictAdders = {};
    let _globalDict, _globalDictEncoded;
    let _preloadDict = message.newGlobalDict();

    let version = 'dev', versionHash = 'h'+Date.now();

    if (process.env.KORU_APP_VERSION !== undefined) {
      const parts = process.env.KORU_APP_VERSION.split(',');
      version = parts[0]; versionHash = parts[1];
    }


    globalDictAdders[module.id] = adder => {
      for (const name in session._rpcs) {
        adder(name);
      }
    };

    const addToDict = word => {_preloadDict && message.addToDict(_preloadDict, word)};

    const onConnection = ws => {
      const ugr = ws.upgradeReq;
      const _remoteAddress = ugr.socket.remoteAddress;
      const remoteAddress = /127\.0\.0\.1/.test(_remoteAddress) ?
              ugr.headers['x-real-ip'] || _remoteAddress : _remoteAddress;

      const newSession = (wrapOnMessage, url=ugr.url) => {
        let newVersion = '';
        if (url !== null) {
          const [protocol, version, hash] = url.split('/').slice(2);
          if (+protocol !== koru.PROTOCOL_VERSION) {
            ws.send('Lkoru/force-reload');
            ws.close();
            return;
          }

          if (hash !== session.versionHash && hash) {
            if (session.version === 'dev')
              newVersion = session.version;
            else {
              const cmp = session.compareVersion ? session.compareVersion(version, hash)
                      : util.compareVersion(version, session.version);
              if (cmp < 0) newVersion = session.version;
              else if (cmp > 0) return; // client on greater version; we will update (hopefully) so
                                        // just wait around
            }
          }
        }

        ++session.totalSessions;
        const sessId = (++sessCounter).toString(36);
        const conn = session.conns[sessId] = new Connection(ws, sessId, () => {
          ws.close();
          const conn = session.conns[sessId];
          if (conn) {
            --session.totalSessions;
            delete session.conns[sessId];
            session.countNotify.notify(conn, false);
            koru.info(`Close conn id:${sessId}, tot:${session.totalSessions}, userId:${conn.userId}`);
          }
        });
        conn.engine = util.browserVersion(ugr.headers['user-agent']||'');
        conn.remoteAddress = remoteAddress;
        conn.remotePort = ugr.socket.remotePort;

        const onMessage = conn.onMessage.bind(conn);
        ws.on('message', wrapOnMessage === undefined ? onMessage : wrapOnMessage(onMessage));

        conn.sendBinary('X', [newVersion, session.versionHash, globalDictEncoded()]);
        koru.info(
          `New conn id:${sessId}, tot:${session.totalSessions}, ver:${version}, `+
            `${conn.engine}, ${remoteAddress}:${conn.remotePort}`);
        session.countNotify.notify(conn, true);
        return conn;
      };

      if (session.connectionIntercept)
        session.connectionIntercept(newSession, ws, remoteAddress);
      else {
        newSession();
      }
    };

    util.merge(session, {
      execWrapper: execWrapper || koru.fiberConnWrapper,
      conns: {},
      sendAll,
      version,
      versionHash,
      unload,
      load,
      totalSessions: 0,
      rpc(name, ...args) {
        return session._rpcs[name].apply(util.thread, args);
      },
      onConnection,
      stop() {
        session.wss.close();
      },

      registerGlobalDictionaryAdder(module, adder) {
        globalDictAdders[module.id] = adder;
      },

      deregisterGlobalDictionaryAdder(module) {
        delete globalDictAdders[module.id];
      },

      addToDict,

      get globalDict() {
        if (_globalDict) return _globalDict;
        return buildGlobalDict();
      },

      // for testing
      get _sessCounter() {return sessCounter},
      get _Connection() {return Connection},
      get _globalDictAdders() {return globalDictAdders},
    });

    const buildGlobalDict = () => {
      for(const name in globalDictAdders) {
        globalDictAdders[name](addToDict);
      }
      _globalDict = _preloadDict;
      _preloadDict = null;

      message.finalizeGlobalDict(_globalDict);
      _globalDictEncoded = new Uint8Array(message.encodeDict(_globalDict, []));
      return _globalDict;
    };

    const globalDictEncoded =
            () => session.globalDict === undefined ? undefined : _globalDictEncoded;

    makeSubject(session.countNotify = {});

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

    function sendAll(cmd, msg) {
      const {conns} = this;
      for(const key in conns) conns[key].send(cmd, msg);
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
        session.versionHash = 'h'+Date.now();
      }
      this.sendAll('U', session.versionHash + ':' + id);
    }

    return session;
  };

  module.exports = webSocketServerFactory;
});
