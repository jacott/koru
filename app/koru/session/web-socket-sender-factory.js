/*global WebSocket, KORU_APP_VERSION */

define((require) => {
  'use strict';
  const {private$}      = require('koru/symbols');
  const message         = require('./message');
  const koru            = require('../main');
  const util            = require('../util');

  const retryCount$ = Symbol(), waitSends$ = Symbol();
  const heatbeatSentAt$ = Symbol(), heatbeatTime$ = Symbol();

  const adjustedNow = () => Date.now() + util.timeAdjust;

  const completeBaseSetup = (base) => {
    base.provide('X', function ([newVersion, hash, dict, dictHash]) {
      if (newVersion !== '') {
        koru.info(`New version: ${newVersion},${hash}`);
        if (typeof this.newVersion === 'function') {
          this.newVersion({newVersion, hash});
        } else {
          return void koru.reload();
        }
      }
      this.hash = hash;
      if (dict !== null) {
        this.dictHash = dictHash;
        this.globalDict = message.newGlobalDict();
        message.decodeDict(dict, 0, this.globalDict);
        message.finalizeGlobalDict(this.globalDict);
      }

      this[retryCount$] = 0;
      this.state.connected(this);

      const {ws, globalDict, [waitSends$]: waitSends} = this;

      for (let i = 0; i < waitSends.length; ++i) {
        // encode here because we may have a different global dictionary
        const item = waitSends[i];
        ws.send(
          typeof item === 'string'
            ? item
            : message.encodeMessage(item[0], item[1], globalDict));
      }
      waitSends.length = 0;
    });

    base.provide('K', function ack(data) {
      const now = adjustedNow();
      const serverTime = +data;
      const sentAt = this[heatbeatSentAt$];
      const uncertainty = now - sentAt;

      this[heatbeatTime$] = now + this.heartbeatInterval;

      if (serverTime > util.DAY) {
        util.adjustTime(
          serverTime < sentAt || serverTime > now ? serverTime - Math.floor((sentAt + now) * 0.5) : 0,
          util.timeUncertainty === 0
            ? uncertainty
            : Math.min(uncertainty, (util.timeUncertainty * 4 + uncertainty) * 0.2),
        );
      }
    });

    base.provide('L', (data) => {require([data], () => {})});
    base.provide('U', function unload(data) {
      const [hash, modId] = data.split(':', 2);
      this.hash = hash;
      koru.unload(modId);
    });

    base.provide('W', function batchedMessages(data) {
      for (let i = 0; i < data.length; ++i) {
        try {
          const msg = data[i];
          const func = this._commands[msg[0]];
          if (func === undefined) {
            throw new Error('Invalid command ' + msg[0]);
          }
          func.call(this, msg[1]);
        } catch (ex) {
          koru.unhandledException(ex);
        }
      }
    });

    base._broadcastFuncs = {};

    base.provide('B', function broadcast(data) {
      const func = base._broadcastFuncs[data[0]];
      if (typeof func !== 'function') {
        koru.error("Broadcast function '" + data[0] + "' not registered");
      } else {
        try {
          func.apply(this, data.slice(1));
        } catch (ex) {
          koru.unhandledException(ex);
        }
      }
    });

    util.merge(base, {
      registerBroadcast(module, name, func) {
        if (arguments.length === 2) {
          func = name;
          name = module;
        } else {
          koru.onunload(module, () => base.deregisterBroadcast(name));
        }
        if (base._broadcastFuncs[name]) {
          throw new Error("Broadcast function '" + name + "' alreaady registered");
        }
        base._broadcastFuncs[name] = func;
      },
      deregisterBroadcast(name) {
        base._broadcastFuncs[name] = null;
      },
    });
  };

  const webSocketSenderFactory = (
    _session, sessState, execWrapper=koru.fiberConnWrapper, base=_session,
  ) => {
    const session = _session;
    const waitSends = session[waitSends$] = [];
    session[retryCount$] = 0;
    let reconnTimeout = null;

    if (! session.version && typeof KORU_APP_VERSION === 'string') {
      const [version, hash] = KORU_APP_VERSION.split(',', 2);
      session.version = version;
      session.hash = hash;
    }

    const closeWs = (ws) => {
      stopReconnTimeout();
      if (ws == null) return;
      try {
        ws.close();
      } catch (ex) {}
      ws.onclose({wasClean: true});
      ws.onmessage = ws.onclose = util.voidFunc;
    };

    util.merge(session, {
      execWrapper,
      ws: null,

      state: sessState,

      send(type, msg) {
        if (this.ws !== null && this.state.isReady()) {
          session.ws.send(type + msg);
        } else {
          waitSends.push(type + msg);
        }
      },

      sendBinary(type, msg) {
        if (this.ws !== null && this.state.isReady()) {
          this.ws.send(message.encodeMessage(type, msg, session.globalDict));
        } else {
          waitSends.push([type, util.deepCopy(msg)]);
        }
      },

      /**
       * @deprecated use start
       */
      connect: start,
      start,

      stop() {
        sessState.close();
        closeWs(this.ws);
        this._onStops?.forEach((func) => func());
      },

      pause() {
        sessState.pause();
        closeWs(this.ws);
      },

      heartbeatInterval: 20000,

      globalDict: message.newGlobalDict(),
      dictHash: null,

      addToDict() {}, // no op on client

      // for testing
      get _waitSends() {return waitSends},
    });

    const stopReconnTimeout = () => {
      if (reconnTimeout !== null) {
        reconnTimeout();
        reconnTimeout = null;
      }
    };

    function start() {
      let heartbeatTO = null;

      if (session.ws != null) return;
      sessState._state = 'startup';
      stopReconnTimeout();
      const ws = session.ws = session.newWs();
      ws.binaryType = 'arraybuffer';

      session[heatbeatTime$] = 0;

      const queueHeatBeat = () => {
        heartbeatTO = null;
        if (session[heatbeatTime$] === null) {
          if (ws != null) {
            ws.onclose = util.voidFunc;
            try {
              ws.close();
            } finally {
              onclose({code: 'Heartbeat fail'});
            }
          }

          return;
        }
        const now = adjustedNow();
        if (now < session[heatbeatTime$]) {
          heartbeatTO = koru._afTimeout(queueHeatBeat, session[heatbeatTime$] - now);
        } else {
          session[heatbeatTime$] = null;
          heartbeatTO = koru._afTimeout(queueHeatBeat, session.heartbeatInterval / 2);
          session[heatbeatSentAt$] = adjustedNow();

          ws.send('H');
        }
      };

      if (session[private$] === undefined) {
        session[private$] = {};
      }

      session[private$].queueHeatBeat = () => {
        heartbeatTO?.();
        queueHeatBeat();
      };

      let onMessage = null;

      ws._session = session;

      session.defaultOnmessage = (event) => {
        session[heatbeatTime$] = adjustedNow() + session.heartbeatInterval;
        if (heartbeatTO == null) {
          heartbeatTO = koru._afTimeout(queueHeatBeat, session.heartbeatInterval);
        }
        if (onMessage === null) {
          onMessage = session._onMessage.bind(session);
        }
        session.execWrapper(onMessage, session, event.data);
      };

      ws.onmessage = session.overrideOnmessage ?? session.defaultOnmessage;

      const onclose = (event) => {
        stopReconnTimeout();
        ws.onmessage = null;
        heartbeatTO?.();
        session[heatbeatTime$] = heartbeatTO = session.ws = null;
        if (event === undefined) return;
        if (event.code !== undefined && event.code !== 1006 && session[retryCount$] != 0) {
          koru.info(event.wasClean ? 'Connection closed' : 'Abnormal close', 'code',
            event.code, new Date());
        }
        session[retryCount$] = Math.min(4, session[retryCount$] + 1);

        if (sessState.isClosed() || sessState.isPaused()) {
          return;
        }

        reconnTimeout = koru._afTimeout(start, session[retryCount$] * 500);

        sessState.retry(event.code, event.reason);
      };

      ws.onerror = util.voidFunc;
      ws.onclose = onclose;
    }

    if (base._broadcastFuncs === undefined) {
      completeBaseSetup(base);
    }

    return session;
  };

  return webSocketSenderFactory;
});
