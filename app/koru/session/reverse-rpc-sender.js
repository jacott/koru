define((require, exports, module) => {
  const koru            = require('koru');
  const RPCQueue        = require('koru/session/rpc-queue');
  const util            = require('koru/util');

  const lastMsgId$ = Symbol(), rpcQueue$ = Symbol(), baseId$ = Symbol();

  class ReverseRpcSender {
    constructor({conn, cmd='F', rpcQueue=new RPCQueue(cmd)}={}) {
      this.cmd = cmd;
      this.rpcQueue = rpcQueue;
      this[lastMsgId$] = 0;
      this.baseId = util.dateNow().toString(36);

      this.setConn(conn);
    }

    static configureSession(session, cmd='F') {
      session.provide(cmd, function (data) {
        const msgId = data[0];
        const args = this[rpcQueue$].get(msgId);
        if (args === void 0) return;
        this[rpcQueue$].delete(msgId);
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
      });
    }

    checkMsgId() {}

    setConn(conn) {
      this.conn = conn;
      if (conn !== void 0) {
        conn[rpcQueue$] = this.rpcQueue;
        this.rpcQueue.resend(this);
      }
    }

    sendBinary(cmd, data) {
      return this.conn?.sendBinary(cmd, data);
    }

    rpc(name, ...args) {
      const {conn} = this;
      let func = args.length == 0 ? void 0 : args.at(-1);
      if (typeof func !== 'function') {
        func = void 0;
      } else {
        args.pop();
      }
      const msgId = (++this[lastMsgId$]).toString(36) + this.baseId;
      const data = [msgId, name];
      for (const arg of args) {
        data.push(util.deepCopy(arg));
      }
      this.rpcQueue.push(this, data, func);
      this.conn?.sendBinary(this.cmd, data);
      return msgId;
    }
  }

  return ReverseRpcSender;
});
