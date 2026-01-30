define((require, exports, module) => {
  'use strict';
  const accSha256       = require('koru/crypto/acc-sha256');
  const TransQueue      = require('koru/model/trans-queue');
  const Observable      = require('koru/observable');
  const Random          = require('koru/random');
  const GlobalDict      = require('koru/session/global-dict');
  const HttpRequest     = require('koru/session/http-request');
  const ServerConnection = require('koru/session/server-connection');
  const SessionVersion  = require('koru/session/session-version');
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
    const gd = GlobalDict.main;
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
        switch (SessionVersion.comparePathVersion(session, url)) {
          case SessionVersion.VERSION_RELOAD:
            forceReload(ws, session);
            return;
          case SessionVersion.VERSION_CLIENT_AHEAD:
            // client on greater version; we will update (hopefully) so just close for now.
            ws.close();
            return;
          case SessionVersion.VERSION_CLIENT_BEHIND:
            newVersion = session.version;
            break;
          case SessionVersion.VERSION_GOOD_DICTIONARY:
            gdict = null;
            dictHash = undefined;
            break;
          case SessionVersion.VERSION_BAD_DICTIONARY:
            break;
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
        if (ex.error === undefined || ex.reason === undefined) {
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
