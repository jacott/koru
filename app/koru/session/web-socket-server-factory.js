define((require, exports, module)=>{
  const Observable      = require('koru/observable');
  const Random          = require('koru/random');
  const ServerConnection = require('koru/session/server-connection');
  const accSha256       = require('koru/srp/acc-sha256');
  const koru            = require('../main');
  const util            = require('../util');
  const message         = require('./message');

  function webSocketServerFactory(session, execWrapper) {
    let sessCounter = 0;
    const globalDictAdders = {};
    let _globalDict, _globalDictEncoded;
    let _preloadDict = message.newGlobalDict();
    let dictHash = [1,2,3,5, 7,11,13,17]; // dont' change this without bumping koru.PROTOCOL_VERSION
    let dictHashStr = null;
    const {version, versionHash} = koru;

    globalDictAdders[module.id] = adder => {
      for (const name in session._rpcs) {
        adder(name);
      }
    };

    const addToDict = word => {
      if (_preloadDict === null) return;
      message.getStringCode(_preloadDict, word) === null &&
        accSha256.add(word, dictHash);
      message.addToDict(_preloadDict, word);
    };

    const onConnection = (ws, ugr) => {
      const _remoteAddress = ugr.connection.remoteAddress;
      const remoteAddress = /127\.0\.0\.1/.test(_remoteAddress) ?
              ugr.headers['x-real-ip'] || _remoteAddress : _remoteAddress;

      const newSession = (wrapOnMessage, url=ugr.url) => {
        let newVersion = '';
        let gdict = globalDictEncoded(), dictHash = dictHashStr;
        const parts = url === null ? null : url.split('?', 2);
        const [clientProtocol, clientVersion, clientHash] = url === null ?
                [] : parts[0].split('/').slice(2);
        if (url !== null) {
          if (+clientProtocol !== koru.PROTOCOL_VERSION) {
            ws.send('Lforce-reload');
            ws.close();
            return;
          }

          if (clientHash !== session.versionHash && clientHash) {
            if (session.version === 'dev')
              newVersion = session.version;
            else {
              const cmp = session.compareVersion ?
                      session.compareVersion(clientVersion, clientHash)
                      : util.compareVersion(clientVersion, session.version);
              if (cmp < 0) newVersion = session.version;
              else if (cmp > 0) return; // client on greater version; we will update (hopefully) so
              // just wait around
            }
          } else {
            const search = util.searchStrToMap(parts[1]);
            if (search.dict === dictHashStr) {
              gdict = null;
              dictHash = undefined;
            }
          }
        }

        ++session.totalSessions;
        const sessId = (++sessCounter).toString(36);
        const conn = session.conns[sessId] = new ServerConnection(session, ws, ugr, sessId, () => {
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
        conn.remotePort = ugr.connection.remotePort;

        const onMessage = conn.onMessage.bind(conn);
        ws.on('message', wrapOnMessage === undefined ? onMessage : wrapOnMessage(onMessage));

        conn.sendBinary('X', [
          newVersion, session.versionHash,
          gdict, dictHash]);
        koru.info(
          `New conn id:${sessId}, tot:${session.totalSessions}, ver:${clientVersion}, `+
            `${conn.engine}, ${remoteAddress}:${conn.remotePort}`);
        session.countNotify.notify(conn, true);
        return conn;
      };

      if (session.connectionIntercept)
        session.connectionIntercept(newSession, ws, ugr, remoteAddress);
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
      dictHashStr = accSha256.toHex(dictHash);
      _preloadDict = dictHash = null;

      message.finalizeGlobalDict(_globalDict);
      _globalDictEncoded = new Uint8Array(message.encodeDict(_globalDict, []));
      return _globalDict;
    };

    const globalDictEncoded =
            () => session.globalDict === undefined ? undefined : _globalDictEncoded;

    session.countNotify = new Observable();

    session.provide('M', function (data) {
      const msgId = data[0];
      const func = session._rpcs[data[1]];
      this.batchMessages();
      try {
        if (! func)
          throw new koru.Error(404, 'unknown method: ' + data[1]);

        util.thread.msgId = msgId;
        if (msgId.length > 17)
          util.thread.random = new Random(msgId);
        const result = func.apply(this, data.slice(2));
        this.sendBinary('M', [msgId, 'r', result]);
        this.releaseMessages();
      } catch(ex) {
        this.abortMessages();
        if (ex.error) {
          this.sendBinary('M', [msgId, 'e', ex.error, ex.reason]);
        } else {
          koru.unhandledException(ex);
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

  koru.onunload(module, 'reload');

  return webSocketServerFactory;
});
