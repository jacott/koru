define((require) => {
  'use strict';
  const koru            = require('koru');
  const RPCQueue        = require('koru/session/rpc-queue');
  const util            = require('koru/util');

  const idSlice = - util.idLen;
  const stringCompare = (a, b) => a.length - b.length || ((a<b) ? -1 : a === b ? 0 : 1);
  const compare = (a, b) => stringCompare(a._id.slice(0, idSlice), b._id.slice(0, idSlice));

  class RPCIDBQueue extends RPCQueue {
    constructor(qdb) {
      super();
      this.qdb = qdb;
      this.lastId = 0;
    }

    push(session, data, func) {
      if (! (this.qdb.isClosed || session.isRpcGet(data[1]))) {
        const rec = {_id: data[0], data};
        this.qdb.put('rpcQueue', rec);
      }
      this.lastId = data[0];
      super.push(session, data, func);
    }

    delete(id) {
      this.qdb.delete('rpcQueue', id);
      super.delete(id);
    }

    reload(session) {
      const {state} = session;
      return this.qdb.getAll('rpcQueue').then((recs) => {
        for (const rec of recs.sort(compare)) {
          state.incPending(true);
          this.lastId = rec.data[0];
          super.push(session, rec.data, callback);
        }
      });
    }
  }

  const callback = (err) => {
    if (err != null && err.error !== 409) {
      koru.globalErrorCatch(err);
    }
  };

  return RPCIDBQueue;
});
