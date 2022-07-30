define((require) => {
  'use strict';
  const util            = require('koru/util');

  const success$ = Symbol(), finally$ = Symbol(), abort$ = Symbol();
  let lastTime = null;

  const asyncTransactionResult = async (list, firstLevel, prevTime, p) => {
    const {thread} = util;
    try {
      const result = await p;
      if (firstLevel) {
        while (list != null) {
          const l = list;
          list = void 0;
          thread[success$] = null;
          await runListAsync(l, 0);
          list = thread[success$];
        }
      }
      return result;
    } catch (err) {
      if (firstLevel) {
        const list = thread[abort$];
        if (list !== void 0) await runListAsync(list, 0);
      }
      throw err;
    } finally {
      if (firstLevel) {
        await runFinallyAsync(prevTime);
      }
    }
  };

  const runFinallyAsync = async (prevTime) => {
    const {thread} = util;
    thread.date = prevTime;
    const list = thread[finally$];
    thread[success$] = thread[abort$] = thread[finally$] = void 0;
    if (list !== void 0) await runListAsync(list, 0, true);
  };

  const runListAsync = async (list, i) => {for (;i < list.length; ++i) await list[i]()};

  const TransQueue = {
    nonNested(db, body) {
      if (this.inTransaction) return body();

      if (db.db !== void 0) db = db.db;
      return this.transaction(db.inTransaction ? void 0 : db, body);
    },

    get inTransaction() {return util.thread[success$] !== void 0},

    transaction: (db, body) => {
      let prevTime;
      const {thread} = util;
      let list = thread[success$];
      let firstLevel = list === void 0;
      if (firstLevel) {
        list = thread[success$] = [];
        thread[abort$] = thread[finally$] = void 0;
        prevTime = thread.date;
        let now = util.dateNow();
        if (now === lastTime) {
          now = lastTime += 1;
        }
        thread.date = lastTime = now;
      }

      if (body === void 0) {
        body = db;
        db = void 0;
      }

      let p;

      try {
        const result = db === void 0 ? body() : db.transaction((tx) => body.call(db, tx));
        if (isPromise(result)) {
          const _firstLevel = firstLevel;
          firstLevel = false;
          return asyncTransactionResult(list, _firstLevel, prevTime, result);
        }

        if (firstLevel) {
          while (list != null) {
            const l = list;
            list = void 0;
            thread[success$] = null;

            for (let i = 0; i < l.length; ++i) l[i]();
            list = thread[success$];
          }
        }
        return result;
      } catch (ex) {
        if (firstLevel) {
          const list = thread[abort$];
          if (list) for (let i = 0; i < list.length; ++i) {
            p = list[i]();
            if (isPromise(p)) {
              p = p.then(() => runListAsync(list, i + 1));
              if (firstLevel) p = p.finally(() => runFinallyAsync(prevTime));
              break;
            }
          }
        }
        throw ex;
      } finally {
        if (firstLevel) {
          if (isPromise(p)) return p;
          thread.date = prevTime;
          const list = thread[finally$];
          thread[success$] = thread[abort$] = thread[finally$] = void 0;
          if (list) for (let i = 0; i < list.length; ++i) {
            const p = list[i]();
            if (isPromise(p)) {
              return p.then(() => runListAsync(list, i + 1));
            }
          }
        }
      }
    },

    finally: (func) => {
      if (util.thread[success$] === void 0) return func();
      const list = util.thread[finally$];
      if (list === void 0) {
        util.thread[finally$] = [func];
      } else {
        list.push(func);
      }
    },

    onSuccess: (func) => {
      let list = util.thread[success$];
      if (list !== void 0) {
        if (list === null) list = util.thread[success$] = [];
        list.push(func);
      } else {
        func();
      }
    },

    onAbort: (func) => {
      if (util.thread[success$] === void 0) return;
      const list = util.thread[abort$];
      if (list === void 0) {
        util.thread[abort$] = [func];
      } else {
        list.push(func);
      }
    },

    isInTransaction: () => util.thread[success$] !== void 0,

    _clearLastTime: () => {lastTime = null},
  };

  return TransQueue;
});
