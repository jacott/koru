define((require)=>{
  const koru            = require('koru');
  const {shallowEqual}  = require('koru/util');
  const message         = require('./message');

  const BINARY = {binary: true};

  const send = (conn, msg)=>{
    if (conn.ws === null) return;
    try {
      conn.ws.send(msg, BINARY);
    } catch(ex) {
      conn.close();
      koru.info('batch send exception', ex);
    }
  };

  class BatchMessage {
    constructor (conn) {
      this.conn = conn;
      this.first = this.last = null;
    }

    batch(conn, type, args, func) {
      const {last} = this;
      const msg = {type, args, func, conns: conn};

      if (last !== null) {
        if (last.type === type && last.func === func && shallowEqual(last.args, args)) {

          last.conns = {
            conn,
            next: last.conns.sessId === undefined ?
              last.conns : {conn: last.conns}};
          return;
        }
        last.next = msg;
      }

      this.last = msg;
      if (this.first === null) this.first = msg;
    }

    abort() {
      this.first = this.last = null;
    }

    release() {
      const gDict = this.conn._session.globalDict;
      for (let curr = this.first; curr; curr = curr && curr.next) {
        let args = curr.func ? curr.func(curr.args) : curr.args;
        let cconn = curr.conns;
        if (cconn.sessId) {
          // one conn
          if (curr.next && curr.next.conns === cconn) {
            const batch = [];
            while (curr.conns === cconn) {
              batch.push([curr.type,  args]);
              curr = curr.next;
              if (! curr) break;
              args =  curr.func ? curr.func(curr.args) : curr.args;
            }
            // many messages
            const msg = message.encodeMessage('W', batch, gDict);
            send(cconn, msg);
            if (! curr) continue;
            cconn = curr.conns;
          }
          if (cconn.sessId) {
            const msg = message.encodeMessage(curr.type, args, gDict);
            send(cconn, msg);
            continue; // just one unique message
          }
        }
        // one message to many conns
        const msg = message.encodeMessage(curr.type, args, gDict);
        for (let cc = cconn; cc; cc = cc.next) {
          send(cc.conn, msg);
        }
      }
    }
  };

  return BatchMessage;
});
