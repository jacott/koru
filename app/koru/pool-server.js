define(function(require, exports, module) {
  const util = require('koru/util');
  const koru = require('./main');

  class Pool {
    constructor(config) {
      const v = this._private = util.merge({
        max: 10,
        min: 0,
        idleTimeoutMillis: 30*1000,
      }, config);
      v.count = 0;
    }

    acquire() {
      var v = this._private;
      if (v.draining) throw new Error('The pool is closed for draining');
      var head = fetchHead(v, 'idle');
      if (head) {
        ++v.count;
        return head.conn;
      }

      if (v.count === v.max) {
        var future = new util.Future;
        addTail(v, 'wait', {future: future});

        return future.wait();
      }

      ++v.count;

      var future = new util.Future;
      v.create(function (err, conn) {
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
      var v = this._private;

      var wait = fetchHead(v, 'wait');

      var now = util.dateNow();
      addTail(v, 'idle', {conn: conn, at: now+v.idleTimeoutMillis});
      if (! v.idleTimeout) {
        if (wait) {
          fetchHead(v, 'idle');
          wait.future.return(conn);
        } else {
          v.idleTimeout = global.setTimeout(clearIdle, v.idleTimeoutMillis);
        }
      } else if (wait) {
        global.clearTimeout(v.idleTimeout);
        var idle = fetchHead(v, 'idle');
        v.idleTimeout = global.setTimeout(clearIdle, idle.at - now);
        wait.future.return(idle.conn);
      } else {
        --v.count;
      }

      function clearIdle() {
        v.idleTimeout = null;

        var now = util.dateNow();
        while(v.idleHead) {
          if (v.idleHead.at <= now) {
            --v.count;
            v.destroy(fetchHead(v, 'idle').conn);
          } else {
            v.idleTimeout = global.setTimeout(clearIdle, v.idleHead.at - now);
            break;
          }
        }
      }
    }

    drain() {
      const v = this._private;

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

  function clearWait(v, err) {
    var head;
    while(head = fetchHead(v, 'wait')) {
      head.future.throw(err);
    }
  }

  function fetchHead(v, name) {
    const nameHead = name+'Head';

    const head = v[nameHead];
    if (! head) return;

    if (! (v[nameHead] = head.next))
      v[name+'Tail'] = null;
    else
      head.next.prev = null;

    return head;
  }

  function addTail(v, name, node) {
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
  }

  return Pool;
});
