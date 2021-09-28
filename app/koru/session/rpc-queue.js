define((require) => {
  'use strict';
  const util            = require('koru/util');

  class RPCQueue {
    constructor(cmd='M') {
      this.cmd = cmd;
      this.queue = util.createDictionary();
    }
    push(session, data, func) {
      const id = data[0];
      this.queue[id] = [data, func];
      session.checkMsgId(id);
    }
    delete(id) {delete this.queue[id]}
    get(id) {return this.queue[id]}
    isRpcPending() {return ! util.isObjEmpty(this.queue)}
    resend(session) {
      const {queue} = this;
      for (const id in queue) {
        session.sendBinary(this.cmd, queue[id][0]);
      }
    }
  }

  return RPCQueue;
});
