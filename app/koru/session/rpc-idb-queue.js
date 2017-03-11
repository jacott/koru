define(function(require, exports, module) {
  const RPCQueue = require('koru/session/rpc-queue');
  const util     = require('koru/util');

  class RPCIDBQueue extends RPCQueue {
    constructor(qdb) {
      super();
      this.qdb = qdb;
    }

    push(id, payload) {
      const rec = {_id: id, data: payload[0]};
      this.qdb.put('rpcQueue', rec);
      super.push(id, payload);
    }

    delete(id) {
      this.qdb.delete('rpcQueue', id);
      super.delete(id);
    }

    reload({state}) {
      return this.qdb.getAll('rpcQueue').then(recs => {
        recs.forEach(rec => {
          state.incPending();

          super.push(rec._id, [rec.data]);
        });
      });
    }
  }

  return RPCIDBQueue;
});
