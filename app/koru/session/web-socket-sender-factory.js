/*global WebSocket, KORU_APP_VERSION */

define(function(require, exports, module) {
  const koru    = require('../main');
  const util    = require('../util');
  const message = require('./message');

  function webSocketSenderFactory(session, sessState, execWrapper=koru.fiberConnWrapper,
                                  base=session) {
    const waitSends = [];
    let retryCount = 0;
    let reconnTimeout;

    if (! session.version && typeof KORU_APP_VERSION === 'string') {
      const [version, hash] = KORU_APP_VERSION.split(",", 2);
      session.version = version;
      session.hash = hash;
    }

    function closeWs(ws) {
      stopReconnTimeout();
      if (! ws) return;
      try {
        ws.close();
      } catch(ex) {}
      ws.onclose({wasClean: true});
    }

    util.merge(session, {
      execWrapper,

      state: sessState,

      send(type, msg) {
        if (this.state.isReady() && this.ws) session.ws.send(type+msg);
        else waitSends.push(type+msg);
      },

      sendBinary(type, msg) {
        if (this.state.isReady()) this.ws.send(message.encodeMessage(type, msg, session.globalDict));
        else waitSends.push([type, util.deepCopy(msg)]);
      },

      connect,

      stop() {
        sessState.close();
        closeWs(this.ws);
        this._onStops && this._onStops.forEach(func => func());
      },

      pause() {
        sessState.pause();
        closeWs(this.ws);
      },

      heartbeatInterval: 20000,

      globalDict: message.newGlobalDict(),

      addToDict() {}, // no op on client

      // for testing
      get _waitSends() {return waitSends},
    });

    function stopReconnTimeout() {
      if (reconnTimeout) {
        reconnTimeout();
        reconnTimeout = null;
      }
    }

    function connect() {
      let heartbeatTO, heatbeatTime;

      if (session.ws) return;
      sessState._state = 'startup';
      stopReconnTimeout();
      let ws = session.ws = session.newWs();
      ws.binaryType = 'arraybuffer';

      const queueHeatBeat = () => {
        heartbeatTO = null;
        if (heatbeatTime === null) {
          try {
            ws.close();
          } finally {
            if (ws) {
              ws.onclose({code: 'Heartbeat fail'});
            }
          }
          return;
        }
        const now = util.dateNow();
        if (now < heatbeatTime) {
          heartbeatTO = koru._afTimeout(queueHeatBeat, heatbeatTime - now);
        } else {
          heatbeatTime = null;
          heartbeatTO = koru._afTimeout(queueHeatBeat, session.heartbeatInterval / 2);
          ws.send('H');
        }
      };

      session._queueHeatBeat = queueHeatBeat;

      ws.onopen = () => {
        sessState.connected(session);

        // We will need to clear the old global dictionary before we
        // can send queued messages.
        session.globalDict = message.newGlobalDict();

        for(let i = 0; i < waitSends.length; ++i) {
          // encode here because we may have a different global dictionary
          let item = waitSends[i];
          ws.send(typeof item === 'string' ? item : message.encodeMessage.call(message, item[0], item[1], session.globalDict));
        }
        waitSends.length = 0;
      };

      let onMessage = null;

      ws.onmessage = event => {
        heatbeatTime = util.dateNow() + session.heartbeatInterval;
        if (! heartbeatTO) {
          heartbeatTO = koru._afTimeout(queueHeatBeat, session.heartbeatInterval);
        }
        if (! onMessage)
          onMessage = session._onMessage.bind(session);
        session.execWrapper(onMessage, session, event.data);
      };

      const onclose  = event => {
        stopReconnTimeout();
        if (heartbeatTO) heartbeatTO();
        heatbeatTime = heartbeatTO = session.ws = ws = session._queueHeatBeat = null;
        if (event.code) retryCount || koru.info(event.wasClean ? 'Connection closed' : 'Abnormal close', 'code', event.code, new Date());
        retryCount = Math.min(4, ++retryCount);

        if (sessState.isClosed() || sessState.isPaused())
          return;

        reconnTimeout = koru._afTimeout(connect, retryCount*500);

        sessState.retry(event.code, event.reason);
      };


      ws.onerror = onclose;
      ws.onclose = onclose;
    }

    if (! base._broadcastFuncs) {
      base.provide('X', function ([newVersion, hash, dict]) {
        if (newVersion !== '') {
          koru.info(`New version: ${newVersion},${hash}`);
          if (typeof this.newVersion === 'function')
            this.newVersion({newVersion, hash});
          else
            return void koru.reload();
        }
        this.hash = hash;
        this.globalDict = message.newGlobalDict();
        message.decodeDict(dict, 0, this.globalDict);
        message.finalizeGlobalDict(this.globalDict);
        retryCount = 0;
      });

      base.provide('K', function ack() {});
      base.provide('L', data => {require([data], () => {})});
      base.provide('U', function unload(data) {
        const [hash, modId] = data.split(':', 2);
        this.hash = hash;
        koru.unload(modId);
      });

      base.provide('W', function batchedMessages(data) {
        util.forEach(data, msg => {
          try {
            this._commands[msg[0]].call(this, msg[1]);
          } catch(ex) {
            koru.error(util.extractError(ex));
          }
        });
      });

      base._broadcastFuncs = {};

      base.provide('B', function broadcast(data) {
        let func = base._broadcastFuncs[data[0]];
        if (! func)
          koru.error("Broadcast function '"+data[0]+"' not registered");
        else try {
          func.apply(this, data.slice(1));
        } catch(ex) {
          koru.error(util.extractError(ex));
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
          if (base._broadcastFuncs[name])
            throw new Error("Broadcast function '"+name+"' alreaady registered");
          base._broadcastFuncs[name] = func;
        },
        deregisterBroadcast(name) {
          base._broadcastFuncs[name] = null;
        },
      });
    }

    return session;
  };

  module.exports = webSocketSenderFactory;
});
