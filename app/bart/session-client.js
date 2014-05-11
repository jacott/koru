/*global define, window, WebSocket, setTimeout */

define(function (require, exports, module) {
  var core = require('./core');
  var session = require('./session');

  var waitFuncs = [];
  var ready = false;
  var retryCount = 0;
  var versionHash;

  core.onunload(module, 'reload');

  session.send = function (type, msg) {
    if (ready) connect._ws.send(type+msg);
    else waitFuncs.push(type+msg);
  };

  session.provide('X', function (data) {
    var ws = this.ws;
    if (versionHash && versionHash !== data)
      core.reload(); // FIXME we want to send queued messages first
    versionHash = data;
    ws.send('X'+ core.engine);
    for(var i = 0; i < waitFuncs.length; ++i) {
      ws.send(waitFuncs[i]);
    }
    waitFuncs = [];
    ready = true;
    retryCount = 0;
  });
  session.provide('L', function (data) {require([data], function() {})});
  session.provide('U', function (data) {
    var args = data.split(':');
    versionHash = args[0];
    core.unload(args[1]);
  });

  connect();

  return session;

  function url() {
    var location = window.document.location;
    return location.protocol.replace(/^http/,'ws')+'//' + location.host;
  }

  function connect() {
    var ws = connect._ws = new WebSocket(url());
    var conn = {
      ws: ws,
    };
    ws.onmessage = function (event) {session._onMessage(conn, event.data)};

    ws.onclose = function (event) {
      ready = false;
      ws = conn = null;
      retryCount = Math.min(40, retryCount * 1.5 + 1);

      setTimeout(connect, retryCount*500);
    };
  }
});
