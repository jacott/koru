define(function(require, _, module) {
  const util = require('koru/util');
  const koru = require('../main');

  module.exports = function init(session) {
    util.extend(session, {
      _waitMs: Object.create(null),
      _msgId: 0,
      rpc,
      sendM,
      isRpcPending,
    });

    session.state._onConnect['20-rpc'] || session.state.onConnect("20-rpc", onConnect);

    session._commands.M || session.provide('M', recvM);

    return session;
  };

  function isRpcPending() {return ! util.isObjEmpty(this._waitMs);}

  function rpc(name, ...args) {
    var func = args[args.length - 1];
    if (typeof func !== 'function') func = null;
    else
      args.length = args.length - 1;

    if (this.isSimulation) {
      this._rpcs[name] && this._rpcs[name].apply(util.thread, args);

    } else try {
      this.isSimulation = true;
      this.sendM(name, args, func);
      this._rpcs[name] && this._rpcs[name].apply(util.thread, args);
    } finally {
      this.isSimulation = false;
    }
  }

  function sendM(name, args, func) {
    var msgId = (++this._msgId).toString(36);
    var data = [msgId, name];
    args && util.forEach(args, arg => data.push(util.deepCopy(arg)));
    this._waitMs[msgId] = [data, func];
    this.state.incPending();
    this.state.isReady() && this.sendBinary('M', data);
    return msgId;
  }

  function recvM(data) {
    var session = this;
    var msgId = data[0];
    var args = session._waitMs[msgId];
    if (! args) return;
    delete session._waitMs[msgId];
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
  }

  function onConnect (session) {
    var list = Object.keys(session._waitMs).sort(function (a, b) {
      if (a.length < b.length) return -1;
      if (a.length > b.length) return 1;
      return (a < b) ? -1 : a === b ? 0 : 1;
    });

    util.forEach(list, function (msgId) {
      session.sendBinary('M', session._waitMs[msgId][0]);
    });
  }
});
