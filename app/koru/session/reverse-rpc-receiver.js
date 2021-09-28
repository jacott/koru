define((require, exports, module) => {
  const koru            = require('koru');
  const TransQueue      = require('koru/model/trans-queue');
  const util            = require('koru/util');

  class ReverseRpcReceiver {
    constructor(session, cmd='F') {
      if (session._commands[cmd] !== void 0) throw new Error('Session Already has a ' + cmd + ' command');
      this.session = session;
      this._rpcs = {};
      session.provide(cmd, (data) => {
        const msgId = data[0];
        const func = this._rpcs[util.thread.action = data[1]];
        try {
          if (func === void 0) {
            throw new koru.Error(404, 'unknown method: ' + data[1]);
          }

          const result = TransQueue.transaction(() => {
            util.thread.msgId = msgId;
            return func.apply(session, data.slice(2));
          });
          session.sendBinary(cmd, [msgId, 'r', result]);
        } catch (ex) {
          if (ex.error === void 0) {
            koru.unhandledException(ex);
            session.sendBinary(cmd, [msgId, 'e', ex.toString()]);
          } else {
            session.sendBinary(cmd, [msgId, 'e', ex.error, ex.reason]);
          }
        }
      });
    }

    define(name, func) {
      this._rpcs[name] = func;
      return this;
    }
  }

  return ReverseRpcReceiver;
});
