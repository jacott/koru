/*global WebSocket, */

define(function (require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var message = require('./message');
  var sessState = require('./state');

  koru.onunload(module, 'reload');

  return function (session) {
    var waitSends = [];
    var retryCount = 0;
    var isSimulation = false;
    var reconnTimeout;

    if (typeof window.KORU_APP_VERSION === 'string')
      session.versionHash = window.KORU_APP_VERSION;

    util.extend(session, {
      send: function (type, msg) {
        if (sessState.isReady()) connect._ws.send(type+msg);
        else waitSends.push(type+msg);
      },

      sendBinary: function (type, msg) {
        if (sessState.isReady()) connect._ws.send(message.encodeMessage(type, msg));
        else waitSends.push([type, util.deepCopy(msg)]);
      },

      connect: connect,

      stop: function () {
        reconnTimeout && clearTimeout(reconnTimeout);
        reconnTimeout = null;
        sessState.close();
        try {
          connect._ws && connect._ws.close();
        } catch(ex) {}
      },

      newWs: function (url) {
        return new WebSocket(url);
      },

      heartbeatInterval: 20000,

      // for testing
      get _waitSends() {return waitSends},
    });

    session.provide('X', function (data) {
      var ws = this.ws;
      data = data.slice(1).toString();

      if (session.versionHash && session.versionHash.replace(/,.*$/,'') !== data.replace(/,.*$/,'')) {
        koru.reload();
      }
      session.versionHash = data;

      retryCount = 0;
    });

    session.provide('K', function () {}); // acK function
    session.provide('L', function (data) {require([data], function() {})});
    session.provide('U', function (data) {
      var args = data.split(':');
      session.versionHash = args[0];
      koru.unload(args[1]);
    });

    function url() {
      var location = koru.getLocation();
      return location.protocol.replace(/^http/,'ws')+'//' + location.host+'/ws';
    }

    function connect() {
      var ws = connect._ws = session.newWs(url());
      ws.binaryType = 'arraybuffer';
      var conn = {
        ws: ws,
        _queueHeatBeat: queueHeatBeat,
      };
      ws.onopen = function () {
        ws.send('X1');
        sessState.connected(conn);

        // TODO add global dictionary. We will need to receive
        // dictionary before we can send queued
        // messages. Alternatively we can clear the global dictionary
        // so messages do not use it.
        for(var i = 0; i < waitSends.length; ++i) {
          // encode here because we may have a different global dictionary
          var item = waitSends[i];
          ws.send(typeof item === 'string' ? item : message.encodeMessage.apply(message, item));
        }
        waitSends = [];
      };

      ws.onmessage = function (event) {
        heatbeatTime = util.dateNow() + session.heartbeatInterval;
        if (! heartbeatTO) {
          heartbeatTO = koru.setTimeout(queueHeatBeat, session.heartbeatInterval);
          if (heartbeatAF) {
            window.cancelAnimationFrame(heartbeatAF);
            heartbeatAF = null;
          }
        }
        session._onMessage(conn, event.data);
      };

      ws.onclose = function (event) {
        connect._ws = ws = conn = null;
        retryCount || koru.info(event.wasClean ? 'Connection closed' : 'Abnormal close', 'code', event.code, new Date());
        retryCount = Math.min(4, ++retryCount); // FIXME make this different for TDD/Demo vs Production

        if (sessState.isClosed())
          return;

        sessState.retry();

        reconnTimeout = setTimeout(connect, retryCount*500);
      };

      var heartbeatTO, heartbeatAF, heatbeatTime;

      function queueHeatBeat() {
        if (heartbeatAF) {
          heatbeatTime = null;
          heartbeatAF = null;
          heartbeatTO = koru.setTimeout(queueHeatBeat, session.heartbeatInterval / 2);
          ws.send('H');
          return;
        }
        heartbeatTO = null;
        if (heatbeatTime === null) {

          ws.close();
          return;
        }
        var now = util.dateNow();
        if (now < heatbeatTime)
          heartbeatTO = koru.setTimeout(queueHeatBeat, heatbeatTime - now);
        else
          heartbeatAF = window.requestAnimationFrame(queueHeatBeat);
      }
    }

    return session;
  };
});
