/*global WebSocket, */

define(function (require, exports, module) {
  var env = require('../env');
  var util = require('../util');
  var message = require('./message');
  var connectState = require('./connect-state');

  env.onunload(module, 'reload');

  return function (session) {
    var waitSends = [];
    var retryCount = 0;
    var versionHash;
    var isSimulation = false;
    var reconnTimeout;

    util.extend(session, {
      send: function (type, msg) {
        if (connectState.isReady()) connect._ws.send(type+msg);
        else waitSends.push(type+msg);
      },

      sendBinary: function (type, msg) {
        if (connectState.isReady()) connect._ws.send(message.encodeMessage(type, msg));
        else waitSends.push([type, util.deepCopy(msg)]);
      },

      connect: connect,

      stop: function () {
        reconnTimeout && clearTimeout(reconnTimeout);
        reconnTimeout = null;
        connectState.close();
        try {
          connect._ws && connect._ws.close();
        } catch(ex) {}
      },

      newWs: function (url) {
        return new WebSocket(url);
      },

      // for testing
      get _waitSends() {return waitSends},
    });

    session.provide('X', function (data) {
      var ws = this.ws;
      data = data.slice(1).toString();
      if (versionHash && versionHash !== data)
        env.reload();
      versionHash = data;

      retryCount = 0;
    });

    session.provide('L', function (data) {require([data], function() {})});
    session.provide('U', function (data) {
      var args = data.split(':');
      versionHash = args[0];
      env.unload(args[1]);
    });

    function url() {
      var location = env.getLocation();
      return location.protocol.replace(/^http/,'ws')+'//' + location.host;
    }

    function connect() {
      var ws = connect._ws = session.newWs(url());
      ws.binaryType = 'arraybuffer';
      var conn = {
        ws: ws,
      };
      ws.onopen = function () {
        ws.send('X1');
        connectState.connected(conn);

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
        session._onMessage(conn, event.data);
      };

      ws.onclose = function (event) {
        connect._ws = ws = conn = null;
        retryCount || env.info(event.wasClean ? 'Connection closed' : 'Abnormal close', 'code', event.code, new Date());
        retryCount = Math.min(4, ++retryCount); // FIXME make this different for TDD/Demo vs Production

        if (connectState.isClosed())
          return;

        connectState.retry();

        reconnTimeout = setTimeout(connect, retryCount*500);
      };
    }

    return session;
  };
});
