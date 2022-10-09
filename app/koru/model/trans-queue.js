define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');

  const tq$ = Symbol();

  let lastTime = 0;

  const asyncTransactionResult = async (tq, prevTq, prevTime, p) => {
    try {
      const result = await p;
      while (tq.success != null) {
        const l = tq.success;
        tq.success = null;
        await runListAsync(l, 0);
      }
      return result;
    } catch (err) {
      const l = tq.abort;
      if (l !== undefined) await runListAsync(l, 0);
      throw err;
    } finally {
      await runFinallyAsync(tq, prevTq, prevTime);
    }
  };

  const runFinallyAsync = async (tq, prevTq, prevTime) => {
    const {thread} = util;
    if (prevTq === undefined) {
      thread.date = prevTime;
    }
    const l = tq.finally;
    thread[tq$] = prevTq;
    if (l !== undefined) await runListAsync(l, 0);
  };

  const runListAsync = async (list, i) => {for (;i < list.length; ++i) await list[i]()};

  const TransQueue = {
    nonNested(db, body) {
      if (body === undefined) {
        body = db;
        db = undefined;
      }
      if (db?.db !== undefined) db = db.db;
      if (db === undefined) {
        return this.inTransaction ? body() : this.transaction(undefined, body);
      }

      if (this.inTransaction) {
        return db.inTransaction ? body() : this.transaction(db, body);
      }

      return this.transaction(db.inTransaction ? undefined : db, body);
    },

    get inTransaction() {return util.thread[tq$] !== undefined},

    transaction: (db, body) => {
      const {thread} = util;
      const prevTq = thread[tq$];
      const tq = thread[tq$] = {success: undefined, abort: undefined, finally: undefined};
      let prevTime = thread.date;
      let now = util.dateNow();
      if (prevTq === undefined) {
        if (now <= lastTime) {
          now = lastTime + 1;
        }
        thread.date = lastTime = now;
      }

      if (body === undefined) {
        body = db;
        db = undefined;
      }

      let p;

      const inner = (tx) => {
        try {
          const result = body.call(db, tx);
          if (isPromise(result)) {
            return p = asyncTransactionResult(tq, prevTq, prevTime, result);
          }

          while (tq.success != null) {
            const l = tq.success;
            tq.success = null;

            for (let i = 0; i < l.length; ++i) l[i]();
          }
          return result;
        } catch (ex) {
          const l = tq.abort;
          if (l != null) for (let i = 0; i < l.length; ++i) {
            p = l[i]();
            if (isPromise(p)) {
              return p.then(() => runListAsync(l, i + 1).then(() => Promise.reject(ex)))
                .finally(() => runFinallyAsync(tq, prevTq, prevTime));
            }
          }
          throw ex;
        } finally {
          if (isPromise(p)) return p;
          if (prevTq === undefined) {
            thread.date = prevTime;
          }
          const l = tq.finally;
          thread[tq$] = prevTq;
          if (l) for (let i = 0; i < l.length; ++i) {
            p = l[i]();
            if (isPromise(p)) {
              return p.then(() => runListAsync(l, i + 1));
            }
          }
        }
      };

      return db === undefined ? inner() : db.transaction(inner);
    },

    finally: (callback) => {
      const tq = util.thread[tq$];
      if (tq === undefined) return callback();
      (tq.finally ??= []).push(callback);
    },

    onSuccess: (callback) => {
      let tq = util.thread[tq$];
      if (tq === undefined) return callback();
      (tq.success ??= []).push(callback);
    },

    onAbort: (callback) => {
      const tq = util.thread[tq$];
      if (tq === undefined) return;
      (tq.abort ??= []).push(callback);
    },

    isInTransaction: () => util.thread[tq$] !== undefined,

    _clearLastTime: () => {lastTime = 0},
  };

  if (isTest) {
    // called from test-case Core.start
    (util[isTest] ??= []).push((Core) => Core.onTestStart(module, () => {lastTime = 0}));
  }

  return TransQueue;
});
