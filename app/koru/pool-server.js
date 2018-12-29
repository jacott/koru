define((require)=>{
  const util = require('koru/util');
  const koru = require('./main');

  const {private$} = require('koru/symbols');

  const clearWait = (v, err)=>{
    let head;
    while(head = fetchHead(v, 'wait')) {
      head.future.throw(err);
    }
  };

  const fetchHead = (v, name)=>{
    const nameHead = name+'Head';

    const head = v[nameHead];
    if (! head) return;

    if (! (v[nameHead] = head.next))
      v[name+'Tail'] = null;
    else
      head.next.prev = null;

    return head;
  };

  const addTail = (v, name, node)=>{
    const nameHead = name+'Head';
    const nameTail = name+'Tail';
    node.prev = v[nameTail];
    v[nameTail] = node;
    if (v[nameTail].prev) {
      v[nameTail].prev.next = v[nameTail];
    } else if (! v[nameHead]) {
      v[nameHead] = v[nameTail];
      return true;
    }
  };

  class Pool {
    constructor(config) {
      const v = this[private$] = Object.assign({
        max: 10,
        min: 0,
        idleTimeoutMillis: 30*1000,
      }, config);
      v.count = 0;
    }

    acquire() {
      const v = this[private$];
      if (v.draining) throw new Error('The pool is closed for draining');
      const head = fetchHead(v, 'idle');
      if (head) {
        ++v.count;
        return head.conn;
      }

      if (v.count === v.max) {
        const future = new util.Future;
        addTail(v, 'wait', {future: future});

        return future.wait();
      }

      ++v.count;

      const future = new util.Future;
      v.create((err, conn)=>{
        if (err) {
          --v.count;
          future.throw(err);
          clearWait(v, err);
          return;
        }

        future.return(conn);
      });
      return future.wait();
    }

    release(conn) {
      const v = this[private$];

      const wait = fetchHead(v, 'wait');

      const now = Date.now();
      addTail(v, 'idle', {conn: conn, at: now+v.idleTimeoutMillis});

      const clearIdle = ()=>{
        v.idleTimeout = null;

        const now = Date.now();
        while(v.idleHead) {
          if (v.idleHead.at <= now) {
            --v.count;
            v.destroy(fetchHead(v, 'idle').conn);
          } else {
            v.idleTimeout = setTimeout(clearIdle, v.idleHead.at - now);
            break;
          }
        }
      };

      if (! v.idleTimeout) {
        if (wait) {
          fetchHead(v, 'idle');
          wait.future.return(conn);
        } else {
          v.idleTimeout = setTimeout(clearIdle, v.idleTimeoutMillis);
        }
      } else if (wait) {
        global.clearTimeout(v.idleTimeout);
        const idle = fetchHead(v, 'idle');
        v.idleTimeout = setTimeout(clearIdle, idle.at - now);
        wait.future.return(idle.conn);
      } else {
        --v.count;
      }
    }

    drain() {
      const v = this[private$];

      v.draining = true;
      clearWait(v, new Error('The pool is closed for draining'));
      let idle;
      if (v.idleTimeout)
        global.clearTimeout(v.idleTimeout);
      v.idleTimeout = null;
      while(idle = fetchHead(v, 'idle')) {
        v.destroy(idle.conn);
      };
      v.draining = false;
    }
  };

  return Pool;
});
