define((require)=>{
  const koru            = require('koru');
  const {shallowEqual}  = require('koru/util');
  const message         = require('./message');

  class BatchMessage {
    constructor (conn) {
      this.conn = conn;
      this.first = this.last = void 0;
    }

    batchBroadcast(iter, type, args, func) {
      let conns;
      for (const conn of iter) conns = {conn, next: conns};
      const {last} = this;
      const msg = {type, args, func, conns};

      if (last !== void 0) {
        last.next = msg;
      }

      this.last = msg;
      if (this.first === void 0) this.first = msg;
    }

    batch(conn, type, args, func) {
      const {last} = this;
      const msg = {type, args, func, conns: conn};

      if (last !== void 0) {
        if (last.type === type && last.func === func && shallowEqual(last.args, args)) {

          last.conns = {
            conn,
            next: last.conns.sessId === void 0 ?
              last.conns : {conn: last.conns}};
          return;
        }
        last.next = msg;
      }

      this.last = msg;
      if (this.first === void 0) this.first = msg;
    }

    abort() {
      this.first = this.last = void 0;
    }

    release() {
      const gDict = this.conn._session.globalDict;
      for (let curr = this.first; curr; curr = curr && curr.next) {
        let args = curr.func !== void 0 ? curr.func(curr.args) : curr.args;
        let cconn = curr.conns;
        if (cconn.sessId !== void 0) {
          // one conn
          if (curr.next !== void 0 && curr.next.conns === cconn) {
            const batch = [];
            while (curr.conns === cconn) {
              batch.push([curr.type,  args]);
              curr = curr.next;
              if (! curr) break;
              args =  curr.func !== void 0 ? curr.func(curr.args) : curr.args;
            }
            // many messages
            const msg = message.encodeMessage('W', batch, gDict);
            cconn.sendEncoded(msg);
            if (curr === void 0) continue;
            cconn = curr.conns;
          }
          if (cconn.sessId !== void 0) {
            const msg = message.encodeMessage(curr.type, args, gDict);
            cconn.sendEncoded(msg);
            continue; // just one unique message
          }
        }
        // one message to many conns
        const msg = message.encodeMessage(curr.type, args, gDict);
        for (let cc = cconn; cc !== void 0; cc = cc.next) {
          cc.conn.sendEncoded(msg);
        }
      }
    }
  };

  return BatchMessage;
});
