//;no-client-async
define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');

  const tq$ = Symbol();

  let lastTime = 0;

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

    get inTransaction() {
      return util.thread[tq$] !== undefined;
    },

    transaction: async (db, body) => {
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

      const inner = async (tx) => {
        try {
          const result = await body.call(db, tx);

          while (tq.success != null) {
            const l = tq.success;
            tq.success = null;

            for (const cb of l) await cb();
          }
          return result;
        } catch (ex) {
          const l = tq.abort;
          if (l != null) {
            for (const cb of l) await cb();
          }
          throw ex;
        } finally {
          if (prevTq === undefined) {
            thread.date = prevTime;
          }
          const l = tq.finally;
          thread[tq$] = prevTq;
          if (l) {
            for (const cb of l) await cb();
          }
        }
      };

      return db === undefined ? await inner() : await db.transaction(inner);
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

    _clearLastTime: () => {
      lastTime = 0;
    },
  };

  if (isTest) {
    // called from test-case Core.start
    (util[isTest] ??= []).push((Core) =>
      Core.onTestStart(module, () => {
        lastTime = 0;
      })
    );
  }

  return TransQueue;
});
