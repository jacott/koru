define(function(require, exports, module) {
  const util  = require('koru/util');

  class RPCQueue {
    constructor() {
      this.queue = Object.create(null);
      this.queue.tmp = 1;
      delete this.queue.tmp; // hint to optimizer
    }
    push(msgId, data) {this.queue[msgId] = data}
    delete(msgId) {delete this.queue[msgId]}
    get(msgId) {return this.queue[msgId]}
    isRpcPending() {return ! util.isObjEmpty(this.queue)}
  }

  RPCQueue.prototype[Symbol.iterator] = function* () {
    const {queue} = this;
    const list = Object.keys(queue).sort(function (a, b) {
      if (a.length < b.length) return -1;
      if (a.length > b.length) return 1;
      return (a < b) ? -1 : a === b ? 0 : 1;
    });

    for (let id of list) yield queue[id];
  };

  return RPCQueue;
});
