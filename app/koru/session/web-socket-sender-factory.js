/*global WebSocket, KORU_APP_VERSION */

define(function (require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var message = require('./message');

  return function (session, sessState) {
    var waitSends = [];
    var retryCount = 0;
    var isSimulation = false;
    var reconnTimeout;

    if (! session.versionHash && typeof KORU_APP_VERSION === 'string')
      session.versionHash = KORU_APP_VERSION;

    util.extend(session, {
      send: function (type, msg) {
        if (sessState.isReady() && connect._ws) connect._ws.send(type+msg);
        else waitSends.push(type+msg);
      },

      sendBinary: function (type, msg) {
        if (sessState.isReady()) connect._ws.send(message.encodeMessage(type, msg, session.globalDict));
        else waitSends.push([type, util.deepCopy(msg)]);
      },

      connect: connect,

      stop: function () {
        stopReconnTimeout();
        sessState.close();
        try {
          connect._ws && connect._ws.close();
        } catch(ex) {}
        connect._ws &&
          connect._ws.onclose({wasClean: true});
      },

      heartbeatInterval: 20000,

      globalDict: message.newGlobalDict(),

      addToDict: function () {}, // no op on client

      // for testing
      get _waitSends() {return waitSends},
    });

    session.provide('X', function (data) {
      var ws = this.ws;
      if (session.versionHash && session.versionHash.replace(/,.*$/,'') !== data[1].replace(/,.*$/,'')) {
        koru.reload();
      }
      session.versionHash = data[1];
      session.globalDict = message.newGlobalDict();

      message.decodeDict(data[2], 0, session.globalDict);
      message.finalizeGlobalDict(session.globalDict);

      retryCount = 0;
    });

    session.provide('K', function () {}); // acK function
    session.provide('L', function (data) {require([data], function() {})});
    session.provide('U', function (data) {
      var args = data.split(':');
      session.versionHash = args[0];
      koru.unload(args[1]);
    });

    function stopReconnTimeout() {
      if (reconnTimeout) {
        reconnTimeout();
        reconnTimeout = null;
      }
    }

    function connect() {
      if (connect._ws) return;
      stopReconnTimeout();
      var ws = connect._ws = session.newWs();
      ws.binaryType = 'arraybuffer';
      var conn = {
        ws: ws,
        _queueHeatBeat: queueHeatBeat,
      };
      ws.onerror = onclose;
      ws.onopen = function () {
        ws.send('X1');
        sessState.connected(conn);


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
        session._onMessage(conn, event.data);
      };

      ws.onclose = onclose;

      function onclose(event) {
        stopReconnTimeout();
        if (heartbeatTO) heartbeatTO();
        heatbeatTime = heartbeatTO = connect._ws = ws = conn = null;
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

    session.provide('W', batchedMessages);
    function batchedMessages(data) {
      util.forEach(data, function (msg) {
        try {
          var func = session._commands[msg[0]];
          func(msg[1]);
        } catch(ex) {
          koru.error(util.extractError(ex));
        }
      });
    }


    var broadcastFuncs = {};

    session.provide('B', function (data) {
      var func = broadcastFuncs[data[0]];
      if (! func)
        koru.error("Broadcast function '"+data[1]+"' not registered");
      else try {
        func.apply(session, data.slice(1));
      } catch(ex) {
        koru.error(util.extractError(ex));
      }
    });

    util.extend(session, {
      registerBroadcast: function (name, func) {
        if (broadcastFuncs[name])
          throw new Error("Broadcast function '"+name+"' alreaady registered");
        broadcastFuncs[name] = func;
      },
      deregisterBroadcast: function (name) {
        delete broadcastFuncs[name];
      },
    });

    return session;
  };
});
