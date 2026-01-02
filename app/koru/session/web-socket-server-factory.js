define((require, exports, module) => {
  'use strict';
  const accSha256       = require('koru/crypto/acc-sha256');
  const TransQueue      = require('koru/model/trans-queue');
  const Observable      = require('koru/observable');
  const Random          = require('koru/random');
  const GlobalDict      = require('koru/session/global-dict');
  const HttpRequest     = require('koru/session/http-request');
  const ServerConnection = require('koru/session/server-connection');
  const message         = require('./message');
  const koru            = require('../main');
  const util            = require('../util');

  const forceReload = (ws, session) => {
    ws.send('U' + session.versionHash);
    ws.send('Lforce-reload');
    ws.close();
  };

  function webSocketServerFactory(session, execWrapper) {
    let sessCounter = 0;
    let gd = GlobalDict.main;
    const {version, versionHash} = koru;

    if (session.ServerConnection === undefined) session.ServerConnection = ServerConnection;

    gd.registerAdder(module, (adder) => {
      for (const name in session._rpcs) {
        adder(name);
      }
    });

    const onConnection = (ws, ugr) => {
      const remoteAddress = HttpRequest.remoteAddress(ugr);
      const newSession = (wrapOnMessage, url = ugr.url) => {
        let newVersion = '';
        let gdict = gd.globalDictEncoded(), dictHash = gd.dictHashStr;
        const parts = url === null ? null : url.split('?', 2);
        const [clientProtocol, clientVersion, clientHash] = url === null
          ? []
          : parts[0].split('/').slice(2);
        if (url !== null) {
          if (+clientProtocol !== koru.PROTOCOL_VERSION) {
            forceReload(ws, session);
            return;
          }

          if (clientHash !== '' && clientHash !== session.versionHash) {
            if (session.version === 'dev') {
              newVersion = session.version;
            } else {
              const cmp = session.compareVersion?.(clientVersion, clientHash) ??
                util.compareVersion(clientVersion, session.version);
              if (cmp < 0) {
                if (cmp == -2) {
                  forceReload(ws, session);
                  return;
                }
                newVersion = session.version;
              } else if (cmp > 0) {
                // client on greater version; we will update (hopefully) so just close for now.
                ws.close();
                return;
              }
            }
          } else {
            const search = util.searchStrToMap(parts[1]);
            if (search.dict === gd.dictHashStr) {
              gdict = null;
              dictHash = undefined;
            }
          }
        }

        ++session.totalSessions;
        const sessId = (++sessCounter).toString(36);
        const conn = session.conns[sessId] = new session.ServerConnection(
          session,
          ws,
          ugr,
          sessId,
          () => {
            ws.close();
            const conn = session.conns[sessId];
            if (conn) {
              --session.totalSessions;
              delete session.conns[sessId];
              session.countNotify.notify(conn, false);
              koru.info(`Close conn tot:${session.totalSessions}`);
            }
          },
        );
        conn.engine = util.browserVersion(ugr.headers['user-agent'] ?? '');
        conn.remoteAddress = remoteAddress;
        conn.remotePort = ugr.connection.remotePort;

        const onMessage = conn.onMessage.bind(conn);
        ws.on('message', wrapOnMessage === undefined ? onMessage : wrapOnMessage(onMessage));

        conn.sendBinary('X', [newVersion, session.versionHash, gdict, dictHash]);
        session.countNotify.notify(conn, true);
        return conn;
      };

      if (session.connectionIntercept) {
        session.connectionIntercept(newSession, ws, ugr, remoteAddress);
      } else {
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
      rpc: (name, ...args) => session._rpcs[name].apply(util.thread.connection, args),

      onConnection,
      stop() {
        session.wss.close();
      },

      addToDict: (word) => gd.addToDict(word),

      get globalDict() {
        return gd.globalDict;
      },

      openBatch() {
        return message.openEncoder('W', this.globalDict);
      },

      // for testing
      get _sessCounter() {
        return sessCounter;
      },
    });

    session.countNotify = new Observable();

    session.provide('M', async function (data) {
      const msgId = data[0];
      const func = session._rpcs[util.thread.action = data[1]];
      try {
        if (!func) {
          throw new koru.Error(404, 'unknown method: ' + data[1]);
        }

        const result = await TransQueue.transaction(() => {
          util.thread.msgId = msgId;
          if (msgId.length > 17) {
            util.thread.random = new Random(msgId);
          }
          return func.apply(this, data.slice(2));
        });
        this.sendBinary('M', [msgId, 'r', result]);
      } catch (ex) {
        if (ex.error === undefined) {
          koru.unhandledException(ex);
          this.sendBinary('M', [msgId, 'e', ex.toString()]);
        } else {
          this.sendBinary('M', [msgId, 'e', ex.error, ex.reason]);
        }
      }
    });

    function sendAll(cmd, msg) {
      const {conns} = this;
      for (const key in conns) conns[key].send(cmd, msg);
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
        session.versionHash = 'h' + Date.now(); // tell reconnecting clients codebase has changed
      }
      this.sendAll('U', session.versionHash + ':' + id);
    }

    if (isTest) {
      session[isTest] = {
        resetSessCounter: () => {
          sessCounter = 0;
        },
      };
    }

    return session;
  }

  koru.onunload(module, 'reload');

  return webSocketServerFactory;
});
