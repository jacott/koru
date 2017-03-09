define(function(require, exports, module) {
  const RPCQueue = require('koru/session/rpc-queue');
  const util     = require('koru/util');
  const koru     = require('../main');

  const penderSym = Symbol();

  function init(session, {pender=new RPCQueue()}={}) {
    util.merge(session, {
      _msgId: 0,
      rpc,
      sendM,
      isRpcPending() {return pender.isRpcPending()},
    });

    session[penderSym] = pender;

    session.state._onConnect['20-rpc'] || session.state.onConnect("20-rpc", onConnect);

    session._commands.M || session.provide('M', recvM);

    return session;
  };

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
    this[penderSym].push(msgId, [data, func]);
    this.state.incPending();
    this.state.isReady() && this.sendBinary('M', data);
    return msgId;
  }

  function recvM(data) {
    var session = this;
    var msgId = data[0];
    var args = session[penderSym].get(msgId);
    if (! args) return;
    session[penderSym].delete(msgId);
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
    for (let msg of session[penderSym]) {
      session.sendBinary('M', msg[0]);
    }
  }

  return init;
});
