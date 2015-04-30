define(function(require, exports, module) {
  var util = require('koru/util');
  var message = require('./message');
  var koru = require('../main');
  var makeSubject = require('../make-subject');

  return function (session, sessState) {
    var waitMs = {};
    var isSimulation = false;

    util.extend(session, {
      get isSimulation() {return isSimulation},

      _msgId: 0,

      rpc: function (name /*, args */) {
        var func = arguments[arguments.length - 1];
        if (typeof func !== 'function') func = null;
        var args = util.slice(arguments, 1, func ? -1 : arguments.length);

        if (isSimulation) {
          this._rpcs[name] && this._rpcs[name].apply(util.thread, args);

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
        var data = [msgId, name];
        args && util.forEach(args, function (arg) {data.push(util.deepCopy(arg))});
        waitMs[msgId] = [data, func];
        sessState.incPending();
        sessState.isReady() && session.sendBinary('M', data);
        return msgId;
      },

      isRpcPending: function () {
        return ! util.isObjEmpty(waitMs);
      },

      // for testing
      _forgetMs: function () {
        waitMs = {};
      },

      get _waitMs() {return waitMs},

      get _onConnect() {return onConnect},
    });

    sessState.onConnect("20", onConnect);

    session.provide('M', function (data) {
      data = message.decodeMessage(data);
      var msgId = data[0];
      var args = waitMs[msgId];
      if (! args) return;
      delete waitMs[msgId];
      sessState.decPending();
      if (! args[1]) return;
      var type = data[1];
      data = data[2];
      if (type === 'e') {
        var ei = data.indexOf(',');
        if (ei === -1)
          args[1](new Error(data));
        else
          args[1](new koru.Error(+data.slice(0, ei), data.slice(ei+1)));
        return;
      }
      args[1](null, data);
    });

    function onConnect () {
      var list = Object.keys(waitMs).sort(function (a, b) {
        if (a.length < b.length) return -1;
        if (a.length > b.length) return 1;
        return (a < b) ? -1 : a === b ? 0 : 1;
      });

      util.forEach(list, function (msgId) {
        session.sendBinary('M', waitMs[msgId][0]);
      });
    }



    return session;
  };
});
