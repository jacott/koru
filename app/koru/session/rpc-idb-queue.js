define(function(require, exports, module) {
  const RPCQueue = require('koru/session/rpc-queue');
  const util     = require('koru/util');

  class RPCIDBQueue extends RPCQueue {
    constructor(qdb) {
      super();
      this.qdb = qdb;
    }

    push(session, data, func) {
      if (! session.isRpcGet(data[1])) {
        const rec = {_id: data[0], data};
        this.qdb.put('rpcQueue', rec);
      }
      super.push(session, data, func);
    }

    delete(id) {
      this.qdb.delete('rpcQueue', id);
      super.delete(id);
    }

    reload(session) {
      const {state} = session;
      return this.qdb.getAll('rpcQueue').then(recs => {
        recs.forEach(rec => {
          state.incPending(true);
          super.push(session, rec.data);
        });
      });
    }
  }

  return RPCIDBQueue;
});
