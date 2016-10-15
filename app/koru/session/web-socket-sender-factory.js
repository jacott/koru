/*global WebSocket, KORU_APP_VERSION */

define(function(require, exports, module) {
  const koru    = require('../main');
  const util    = require('../util');
  const message = require('./message');

  function webSocketSenderFactory(session, sessState, execWrapper=koru.fiberConnWrapper, base=session) {
    const waitSends = [];
    let retryCount = 0;
    let reconnTimeout;

    if (! session.versionHash && typeof KORU_APP_VERSION === 'string')
      session.versionHash = KORU_APP_VERSION;

    util.extend(session, {
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
        stopReconnTimeout();
        sessState.close();
        try {
          this.ws && this.ws.close();
        } catch(ex) {}
        this.ws &&
          this.ws.onclose({wasClean: true});
        this._onStops && this._onStops.forEach(func => func());
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
      stopReconnTimeout();
      let ws = session.ws = session.newWs();
      ws.binaryType = 'arraybuffer';
      session._queueHeatBeat = queueHeatBeat;

      ws.onerror = onclose;
      ws.onopen = function () {
        ws.send('X2');
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

      ws.onmessage = function (event) {
        heatbeatTime = util.dateNow() + session.heartbeatInterval;
        if (! heartbeatTO) {
          heartbeatTO = koru._afTimeout(queueHeatBeat, session.heartbeatInterval);
        }
        if (! onMessage)
          onMessage = session._onMessage.bind(session);
        session.execWrapper(onMessage, session, event.data);
      };

      ws.onclose = onclose;

      function onclose(event) {
        stopReconnTimeout();
        if (heartbeatTO) heartbeatTO();
        heatbeatTime = heartbeatTO = session.ws = ws = session._queueHeatBeat = null;
        if (event.code) retryCount || koru.info(event.wasClean ? 'Connection closed' : 'Abnormal close', 'code', event.code, new Date());
        retryCount = Math.min(4, ++retryCount);

        if (sessState.isClosed())
          return;

        reconnTimeout = koru._afTimeout(connect, retryCount*500);

        sessState.retry(event.code, event.reason);
      };

      function queueHeatBeat() {
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
      }
    }

    if (! base._broadcastFuncs) {
      base.provide('X', function (data) {
        this.globalDict = message.newGlobalDict();
        message.decodeDict(data[2], 0, this.globalDict);
        message.finalizeGlobalDict(this.globalDict);
        if (this.versionHash) {
          if (session.compareVersion) {
            session.compareVersion(this, data[1]);
          } else if (util.compareVersion(this.versionHash, data[1]) < 1) {
            koru.reload();
            return;
          }
        } else
          this.versionHash = data[1];

        retryCount = 0;
      });

      base.provide('K', function ack() {});
      base.provide('L', function load(data) {require([data], function() {})});
      base.provide('U', function unload(data) {
        let args = data.split(':');
        this.versionHash = args[0];
        koru.unload(args[1]);
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


      util.extend(base, {
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
