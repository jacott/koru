define((require)=>{
  const koru            = require('koru');
  const util            = require('koru/util');
  const message         = require('./message');

  const BINARY = {binary: true};

  const send = (conn, msg)=>{
    if (! conn.ws) return;
    try {
      conn.ws.send(msg, BINARY);
    } catch(ex) {
      conn.close();
      koru.info('batch send exception', ex);
    }
  };

  const addConn = (msg, conn)=>{
    msg.conns = {conn: conn, next: msg.conns.sessId ? {conn: msg.conns} : msg.conns};
  };

  const addMessage = (bm, conn, msg)=>{
    msg.conns = conn;
    if (bm.last) bm.last.next = msg;
    bm.last = msg;
    if (! bm.first) bm.first = msg;
  };

  class BatchMessage {
    constructor (conn) {
      this.conn = conn;
      this.first = this.last = null;
    }

    batch(conn, type, args, func) {
      const last = this.last;
      if (last) {
        if (last.type === type && last.func === func && util.shallowEqual(last.args, args)) {

          addConn(last, conn);
          return;
        }
      }
      addMessage(this, conn, {type, args, func});
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
        for (var cc = cconn; cc; cc = cc.next) {
          send(cc.conn, msg);
        }
      }
    }
  };

  return BatchMessage;
});
