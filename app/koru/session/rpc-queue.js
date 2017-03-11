define(function(require, exports, module) {
  const util  = require('koru/util');

  class RPCQueue {
    constructor() {
      this.queue = Object.create(null);
      this.queue.tmp = 1;
      delete this.queue.tmp; // hint to optimizer
    }
    push(id, data) {this.queue[id] = data}
    delete(id) {delete this.queue[id]}
    get(id) {return this.queue[id]}
    isRpcPending() {return ! util.isObjEmpty(this.queue)}
    resend(session) {
      const {queue} = this;
      Object.keys(queue).sort(function (a, b) {
        if (a.length < b.length) return -1;
        if (a.length > b.length) return 1;
        return (a < b) ? -1 : a === b ? 0 : 1;
      }).forEach(id => {
        session.sendBinary('M', queue[id][0]);
      });
    }
  }

  return RPCQueue;
});
