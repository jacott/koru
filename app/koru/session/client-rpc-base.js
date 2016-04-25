define(function(require, exports, module) {
  var util = require('koru/util');
  var message = require('./message');
  var koru = require('../main');
  var makeSubject = require('../make-subject');

  return function (session) {
    var waitMs = {};
    var isSimulation = false;

    util.extend(session, {
      get isSimulation() {return isSimulation},

      _msgId: 0,

      rpc: function (name, ...args) {
        var func = args[args.length - 1];
        if (typeof func !== 'function') func = null;
        else
          args.length = args.length - 1;

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
        session.state.incPending();
        session.state.isReady() && session.sendBinary('M', data);
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

    session.state._onConnect['20'] || session.state.onConnect("20", onConnect);

    session._commands.M || session.provide('M', function (data) {
      var session = this;
      var msgId = data[0];
      var args = waitMs[msgId];
      if (! args) return;
      delete waitMs[msgId];
      session.state.decPending();
      var type = data[1];
      if (type === 'e') {
        var callback = args[1] || koru.globalCallback;
        if (data.length === 3)
          callback(new Error(data[2]));
        else
          callback(new koru.Error(+data[2], data[3]));
        return;
      }
      args[1] && args[1](null, data[2]);
    });

    function onConnect (session) {
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
