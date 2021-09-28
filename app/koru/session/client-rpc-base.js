define((require) => {
  'use strict';
  const Random          = require('koru/random');
  const RPCQueue        = require('koru/session/rpc-queue');
  const util            = require('koru/util');
  const koru            = require('../main');

  const rpcQueue$ = Symbol(), baseId$ = Symbol(),
        lastMsgId$ = Symbol(), nextMsgId$ = Symbol();

  function cancelRpc(msgId) {
    const rpcQueue = this[rpcQueue$];
    const entry = rpcQueue.get(msgId);
    if (entry !== void 0) {
      rpcQueue.delete(msgId);
      this.state.decPending(! this.isRpcGet(entry[0][1]));
      return true;
    }
  }

  function checkMsgId(msgId) {
    const nid = parseInt(msgId.slice(0, - this[baseId$].length), 36);
    if (nid >= this[nextMsgId$]) {
      this[nextMsgId$] = nid+1;
    }
  }

  function lastMsgId() {return this[lastMsgId$]}

  function isRpcPending() {return this[rpcQueue$].isRpcPending()}

  function replaceRpcQueue(value) {
    const {queue} = this[rpcQueue$];
    this[rpcQueue$] = value;
    for (const id in queue) {
      value.push(this, ...queue[id]);
    }
  }

  function init(session, {rpcQueue=new RPCQueue()}={}) {
    Object.assign(session, {
      rpc,
      _sendM,
      cancelRpc,
      isRpcPending,
      checkMsgId,
      replaceRpcQueue,
    });
    Object.defineProperty(session, 'lastMsgId', {configurable: true, get: lastMsgId});
    session[nextMsgId$] = 1,
    session[lastMsgId$] = '',
    session[baseId$] = Random.global.id();
    session[rpcQueue$] = rpcQueue;

    session.state._onConnect['20-rpc'] ?? session.state.onConnect('20-rpc', onConnect);

    session.provide('M', recvM);

    return session;
  }

  function rpc(name, ...args) {
    let func = args[args.length - 1];
    if (typeof func !== 'function') {
      func = null;
    } else {
      args.length = args.length - 1;
    }

    if (this.isSimulation) {
      this._rpcs[name]?.apply(util.thread, args);
    } else {
      try {
        this.isSimulation = true;
        this._sendM(name, args, func);
        this._rpcs[name]?.apply(util.thread, args);
      } finally {
        this.isSimulation = false;
      }
    }
  }

  function _sendM(name, args, func) {
    const msgId = this[lastMsgId$] = (this[nextMsgId$]++).toString(36) + this[baseId$];
    const data = [msgId, name];
    if (args !== void 0) for (const arg of args) data.push(util.deepCopy(arg));
    this[rpcQueue$].push(this, data, func);
    this.state.incPending(! this.isRpcGet(name));
    this.state.isReady() && this.sendBinary('M', data);
    return msgId;
  }

  function recvM(data) {
    const session = this;
    const msgId = data[0];
    const args = session[rpcQueue$].get(msgId);
    if (args === void 0) return;
    session.cancelRpc(msgId);
    const type = data[1];
    if (type === 'e') {
      const callback = args[1] ?? koru.globalCallback;
      if (data.length === 3) {
        callback(new Error(data[2]));
      } else {
        callback(new koru.Error(+ data[2], data[3]));
      }
      return;
    }
    args[1]?.(null, data[2]);
  }

  function onConnect(session) {
    session[rpcQueue$].resend(session);
  }

  return init;
});
