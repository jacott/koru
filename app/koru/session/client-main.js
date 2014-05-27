/*global WebSocket, */

define(function (require, exports, module) {
  var env = require('../env');
  var util = env.util;
  var session = require('./main');

  var waitFuncs = [];
  var state = 'disconnected';
  var retryCount = 0;
  var versionHash;
  var isSimulation = false;

  env.onunload(module, 'reload');

  util.extend(session, {
    send: function (type, msg) {
      if (state === 'ready') connect._ws.send(type+msg);
      else waitFuncs.push(type+msg);
    },
    rpc: function (name /*, args */) {
      var args = util.slice(arguments, 1, (typeof arguments[arguments.length - 1] === 'function') ? -1 : arguments.length);
      if (isSimulation) {
        this._rpcs[name].apply(util.thread, args);
      } else try {
        isSimulation = true;
        session.sendM(name, args);
        this._rpcs[name].apply(util.thread, args);
      } finally {
        isSimulation = false;
      }
    },

    sendM: sendFunc('M'),
    sendP: sendFunc('P'),

    get isSimulation() {return isSimulation},
  });

  session.provide('X', function (data) {
    var ws = this.ws;
    if (versionHash && versionHash !== data)
      env.reload(); // FIXME we want to send queued messages first
    versionHash = data;
    ws.send('X'+ env.util.engine);

    for(var i = 0; i < session._onConnect.length; ++i) {
      session._onConnect[i]();
    }

    for(var i = 0; i < waitFuncs.length; ++i) {
      ws.send(waitFuncs[i]);
    }
    waitFuncs = [];
    state = 'ready';
    retryCount = 0;
  });
  session.provide('L', function (data) {require([data], function() {})});
  session.provide('U', function (data) {
    var args = data.split(':');
    versionHash = args[0];
    env.unload(args[1]);
  });

  util.extend(session, {
    _onConnect: [],
    onConnect: function (func) {
      this._onConnect.push(func);
    },

    connect: connect,
  });


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
      state = 'disconnected';
      ws = conn = null;
      retryCount || env.info(event.wasClean ? 'Connection closed' : 'Abnormal close', 'code', event.code, new Date());
      retryCount = Math.min(4, ++retryCount); // FIXME make this different for TDD/Demo vs Production


      setTimeout(connect, retryCount*500);
    };
  }

  function sendFunc(code) {
    return function (name, args) {
      session.send(code, (args === undefined) ? name : name + JSON.stringify(args));
    };
  }

  return session;
});
