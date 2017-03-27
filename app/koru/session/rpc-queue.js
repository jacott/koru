define(function(require, exports, module) {
  const util  = require('koru/util');

  class RPCQueue {
    constructor() {
      this.queue = Object.create(null);
      this.queue.tmp = 1;
      delete this.queue.tmp; // hint to optimizer
    }
    push(session, data, func) {this.queue[data[0]] = [data, func]}
    delete(id) {delete this.queue[id]}
    get(id) {return this.queue[id]}
    isRpcPending() {return ! util.isObjEmpty(this.queue)}
    resend(session) {
      const {queue} = this;
      const ids = Object.keys(queue).sort(compare);
      if (ids.length) {
        const last = parseInt(queue[ids[ids.length - 1]][0][0].slice(0,-util.idLen), 36) ||
                ids.length+1000; // lets try and move past any bad ones
        if (last > session._msgId)
          session._msgId = last;
        ids.forEach(id => {
          session.sendBinary('M', queue[id][0]);
        });
      }
    }
  }

  function compare(a, b) {
    return a.length - b.length || ((a < b) ? -1 : a === b ? 0 : 1);
  }

  return RPCQueue;
});
