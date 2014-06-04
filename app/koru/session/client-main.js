/*global WebSocket, */

define(function (require, exports, module) {
  var env = require('../env');
  var util = require('../util');
  var makeSubject = require('../make-subject');

  env.onunload(module, 'reload');

  return function (session) {
    var waitFuncs = [];
    var waitMs = {};
    var state = 'closed';
    var retryCount = 0;
    var versionHash;
    var isSimulation = false;

    util.extend(session, {
      _msgId: 0,

      send: function (type, msg) {
        if (state === 'ready') connect._ws.send(type+msg);
        else waitFuncs.push(type+msg);
      },
      rpc: function (name /*, args */) {
        var func = arguments[arguments.length - 1];
        if (typeof func !== 'function') func = null;
        var args = util.slice(arguments, 1, func ? -1 : arguments.length);

        if (isSimulation) {
          this._rpcs[name].apply(util.thread, args);

        } else try {
          isSimulation = true;
          session.sendM(name, args, func);
          this._rpcs[name] && this._rpcs[name].apply(util.thread, args);
        } finally {
          isSimulation = false;
        }
      },

      sendM: function (name, args, func) {
        var msgId = (++session._msgId).toString(36);
        var data = msgId+'|'+ (args === undefined ? name : name + JSON.stringify(args));
        for(var one in waitMs) {break;}
        one || session.rpc.notify(true);
        waitMs[msgId] = [data, func];
        state === 'ready' && session.send('M', data);
      },
      sendP: sendFunc('P'),

      get isSimulation() {return isSimulation},

      _onConnect: [],
      onConnect: function (func) {
        this._onConnect.push(func);
      },

      stopOnConnect: function (func) {
        var index = util.removeItem(this._onConnect, func);
      },

      connect: connect,

      stop: function () {
        state = 'closed';
        connect._ws && connect._ws.stop();
      },

      _forgetMs: function () {
        waitMs = {};
      }
    });

    makeSubject(session.rpc);
    session.rpc.waiting = function () {
      for(var one in waitMs) {return true;}
      return false;
    };

    session.provide('X', function (data) {
      var ws = this.ws;
      data = data.slice(1).toString();
      if (versionHash && versionHash !== data)
        env.reload();
      versionHash = data;

      retryCount = 0;
    });

    session.provide('M', function (data) {
      var index = data.indexOf('|');
      if (index === -1) return env.error('bad M msg: ' + data);
      var msgId = data.slice(0, index);
      var args = waitMs[msgId];
      if (! args) return;
      delete waitMs[msgId];
      for(var one in waitMs) {break;}
      one || session.rpc.notify(false);
      if (! args[1]) return;
      var type = data[index + 1];
      index += 2;
      if (type === 'e') {
        var ei = data.indexOf(',', index);
        if (ei === -1)
          args[1](new Error(data.slice(index)));
        else
          args[1](new env.Error(+data.slice(index, ei), data.slice(ei+1)));
        return;
      }
      data = data.slice(index);
      args[1](null, data ? JSON.parse(data) : null);
    });

    session.provide('L', function (data) {require([data], function() {})});
    session.provide('U', function (data) {
      var args = data.split(':');
      versionHash = args[0];
      env.unload(args[1]);
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
      ws.onopen = function (event) {
        ws.send('X1'+ env.util.engine);
        state = 'ready';

        for(var i = 0; i < session._onConnect.length; ++i) {
          session._onConnect[i].call(conn);
        }

        for(var i = 0; i < waitFuncs.length; ++i) {
          ws.send(waitFuncs[i]);
        }
        waitFuncs = [];
      };

      ws.onmessage = function (event) {session._onMessage(conn, event.data)};

      ws.onclose = function (event) {
        connect._ws = ws = conn = null;
        retryCount || env.info(event.wasClean ? 'Connection closed' : 'Abnormal close', 'code', event.code, new Date());
        retryCount = Math.min(4, ++retryCount); // FIXME make this different for TDD/Demo vs Production

        if (state === 'closed')
          return;

        state = 'retry';

        setTimeout(connect, retryCount*500);
      };
    }

    function sendFunc(code) {
      return function (name, args) {
        session.send(code, (args === undefined) ? name : name + JSON.stringify(args));
      };
    }

    return session;
  };
});
