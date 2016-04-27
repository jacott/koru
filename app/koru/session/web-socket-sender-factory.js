/*global WebSocket, KORU_APP_VERSION */

define(function (require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var message = require('./message');

  module.exports = exports = function (session, sessState, execWrapper, base) {
    base = base || session;
    var waitSends = [];
    var retryCount = 0;
    var reconnTimeout;

    if (! session.versionHash && typeof KORU_APP_VERSION === 'string')
      session.versionHash = KORU_APP_VERSION;

    util.extend(session, {
      execWrapper: execWrapper || defaultWrapper,

      state: sessState,

      send: function (type, msg) {
        if (this.state.isReady() && this.ws) session.ws.send(type+msg);
        else waitSends.push(type+msg);
      },

      sendBinary: function (type, msg) {
        if (this.state.isReady()) this.ws.send(message.encodeMessage(type, msg, session.globalDict));
        else waitSends.push([type, util.deepCopy(msg)]);
      },

      connect: connect,

      stop: function () {
        stopReconnTimeout();
        sessState.close();
        try {
          this.ws && this.ws.close();
        } catch(ex) {}
        this.ws &&
          this.ws.onclose({wasClean: true});
      },

      heartbeatInterval: 20000,

      globalDict: message.newGlobalDict(),

      addToDict: function () {}, // no op on client

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
      if (session.ws) return;
      stopReconnTimeout();
      var ws = session.ws = session.newWs();
      ws.binaryType = 'arraybuffer';
      session._queueHeatBeat = queueHeatBeat;

      ws.onerror = onclose;
      ws.onopen = function () {
        ws.send('X1');
        sessState.connected(session);


        // We will need to clear the old global dictionary before we
        // can send queued messages.
        session.globalDict = message.newGlobalDict();

        for(var i = 0; i < waitSends.length; ++i) {
          // encode here because we may have a different global dictionary
          var item = waitSends[i];
          ws.send(typeof item === 'string' ? item : message.encodeMessage.call(message, item[0], item[1], session.globalDict));
        }
        waitSends = [];
      };

      ws.onmessage = function (event) {
        heatbeatTime = util.dateNow() + session.heartbeatInterval;
        if (! heartbeatTO) {
          heartbeatTO = koru._afTimeout(queueHeatBeat, session.heartbeatInterval);
        }
        session._onMessage(session, event.data);
      };

      ws.onclose = onclose;

      function onclose(event) {
        stopReconnTimeout();
        if (heartbeatTO) heartbeatTO();
        heatbeatTime = heartbeatTO = session.ws = ws = session._queueHeatBeat = null;
        retryCount || koru.info(event.wasClean ? 'Connection closed' : 'Abnormal close', 'code', event.code, new Date());
        retryCount = Math.min(4, ++retryCount);

        if (sessState.isClosed())
          return;

        sessState.retry();

        reconnTimeout = koru._afTimeout(connect, retryCount*500);
      };

      var heartbeatTO, heatbeatTime;

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
        var now = util.dateNow();
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
        var session = this;
        var ws = session.ws;
        if (session.versionHash && session.versionHash.replace(/,.*$/,'') !== data[1].replace(/,.*$/,'')) {
          koru.reload();
        }
        session.versionHash = data[1];
        session.globalDict = message.newGlobalDict();

        message.decodeDict(data[2], 0, session.globalDict);
        message.finalizeGlobalDict(session.globalDict);

        retryCount = 0;
      });

      base.provide('K', function () {}); // acK function
      base.provide('L', function (data) {require([data], function() {})});
      base.provide('U', function (data) {
        var args = data.split(':');
        this.versionHash = args[0];
        koru.unload(args[1]);
      });

      base.provide('W', batchedMessages);
      function batchedMessages(data) {
        var session = this;
        util.forEach(data, msg => {
          try {
            var func = session._commands[msg[0]];
            func.call(session, msg[1]);
          } catch(ex) {
            koru.error(util.extractError(ex));
          }
        });
      }

      base._broadcastFuncs = {};

      base.provide('B', function (data) {
        var session = this;
        var func = base._broadcastFuncs[data[0]];
        if (! func)
          koru.error("Broadcast function '"+data[1]+"' not registered");
        else try {
          func.apply(session, data.slice(1));
        } catch(ex) {
          koru.error(util.extractError(ex));
        }
      });


      util.extend(base, {
        registerBroadcast: function (name, func) {
          if (base._broadcastFuncs[name])
            throw new Error("Broadcast function '"+name+"' alreaady registered");
          base._broadcastFuncs[name] = func;
        },
        deregisterBroadcast: function (name) {
          delete base._broadcastFuncs[name];
        },
      });
    }

    return session;
  };

  function defaultWrapper(func, conn, data) {
    try {
      func.call(conn, data);
    } catch(ex) {
      koru.error(util.extractError(ex));
    }
  }
});
