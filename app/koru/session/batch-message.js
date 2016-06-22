define(function(require) {
  const util    = require('koru/util');
  const koru    = require('../main');
  const message = require('./message');

  const BINARY = {binary: true};

  class BatchMessage {
    constructor (session) {
      this.thread = util.thread;
      this.session = session;
      this.first = this.last = null;
    }

    batch (conn, type, args, func) {
      var last = this.last;
      if (last) {
        if (last.type === type && last.func === func && util.shallowEqual(last.args, args)) {

          addConn(last, conn);
          return;
        }
      }
      addMessage(this, conn, {type: type, args: args, func: func});
    }

    abort () {
      this.first = this.last = null;
    }

    release () {
      var gDict = this.session.globalDict;
      var curr = this.first;
      for (var curr = this.first; curr; curr = curr && curr.next) {
        var args = curr.func ? curr.func(curr.args) : curr.args;
        var cconn = curr.conns;
        if (cconn.sessId) {
          // one conn
          if (curr.next && curr.next.conns === cconn) {
            var batch = [];
            while (curr.conns === cconn) {
              batch.push([curr.type,  args]);
              curr = curr.next;
              if (! curr) break;
              args =  curr.func ? curr.func(curr.args) : curr.args;
            }
            // many messages
            var msg = message.encodeMessage('W', batch, gDict);
            send(cconn, msg);
            if (! curr) continue;
            cconn = curr.conns;
          }
          if (cconn.sessId) {
            var msg = message.encodeMessage(curr.type, args, gDict);
            send(cconn, msg);
            continue; // just one unique message
          }
        }
        // one message to many conns
        var msg = message.encodeMessage(curr.type, args, gDict);
        for (var cc = cconn; cc; cc = cc.next) {
          send(cc.conn, msg);
        }
      }
    }
  };

  function send(conn, msg) {
    if (! conn.ws) return;
    try {
      conn.ws.send(msg, BINARY);
    } catch(ex) {
      conn.close();
      koru.info('batch send exception', ex);
    }
  }


  function addConn(msg, conn) {
    msg.conns = {conn: conn, next: msg.conns.sessId ? {conn: msg.conns} : msg.conns};
  }

  function addMessage(bm, conn, msg) {
    msg.conns = conn;
    if (bm.last) bm.last.next = msg;
    bm.last = msg;
    if (! bm.first) bm.first = msg;
  }

  return BatchMessage;
});
