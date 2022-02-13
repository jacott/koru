define((require) => {
  'use strict';
  const Future          = require('koru/future');
  const util            = require('koru/util');

  const {private$} = require('koru/symbols');

  const idleKeys = {
    headKey: 'idleHead',
    tailKey: 'idleTail',
  };

  const waitKeys = {
    headKey: 'waitHead',
    tailKey: 'waitTail',
  };

  const clearWait = (v, err) => {
    let head;
    while (head = fetchHead(v, waitKeys)) {
      head.future.reject(err);
    }
  };

  const fetchHead = (v, {headKey, tailKey}) => {
    const head = v[headKey];
    if (! head) return;

    if (! (v[headKey] = head.next)) {
      v[tailKey] = null;
    } else {
      head.next.prev = null;
    }

    return head;
  };

  const addTail = (v, {headKey, tailKey}, node) => {
    node.prev = v[tailKey];
    v[tailKey] = node;
    if (v[tailKey].prev) {
      v[tailKey].prev.next = v[tailKey];
    } else if (! v[headKey]) {
      v[headKey] = v[tailKey];
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
      v.idleHead = v.idelTail = v.waitHead = v.waitTail = void 0;
      v.count = 0;
    }

    acquire() {
      const v = this[private$];
      if (v.draining) throw new Error('The pool is closed for draining');
      const head = fetchHead(v, idleKeys);
      if (head) {
        ++v.count;
        return head.conn;
      }

      const future = new Future();
      if (v.count === v.max) {
        addTail(v, waitKeys, {future});

        return future.promise;
      }

      ++v.count;

      v.create((err, conn) => {
        if (err) {
          --v.count;
          future.reject(err);
          clearWait(v, err);
          return;
        }

        future.resolve(conn);
      });

      return future.promise;
    }

    release(conn) {
      const v = this[private$];

      const wait = fetchHead(v, waitKeys);

      const now = Date.now();
      addTail(v, idleKeys, {conn, at: now + v.idleTimeoutMillis});

      const clearIdle = () => {
        v.idleTimeout = null;

        const now = Date.now();
        while (v.idleHead) {
          if (v.idleHead.at <= now) {
            --v.count;
            v.destroy(fetchHead(v, idleKeys).conn);
          } else {
            v.idleTimeout = setTimeout(clearIdle, v.idleHead.at - now);
            break;
          }
        }
      };

      if (! v.idleTimeout) {
        if (wait) {
          fetchHead(v, idleKeys);
          wait.future.resolve(conn);
        } else {
          v.idleTimeout = setTimeout(clearIdle, v.idleTimeoutMillis);
        }
      } else if (wait) {
        global.clearTimeout(v.idleTimeout);
        const idle = fetchHead(v, idleKeys);
        v.idleTimeout = setTimeout(clearIdle, idle.at - now);
        wait.future.resolve(idle.conn);
      } else {
        --v.count;
      }
    }

    drain() {
      const v = this[private$];

      v.draining = true;
      clearWait(v, new Error('The pool is closed for draining'));
      let idle;
      if (v.idleTimeout) {
        global.clearTimeout(v.idleTimeout);
      }
      v.idleTimeout = null;
      while (idle = fetchHead(v, idleKeys)) {
        v.destroy(idle.conn);
      }
      v.draining = false;
    }
  }

  return Pool;
});
