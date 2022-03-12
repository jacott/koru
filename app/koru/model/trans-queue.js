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

          for (let i = 0; i < l.length; ++i) await l[i]();
          list = thread[success$];
        }
      }
      return result;
    } catch (ex) {
      if (firstLevel) {
        const list = thread[abort$];
        if (list) for (let i = 0; i < list.length; ++i) {
          await list[i]();
        }
      }
      throw ex;
    } finally {
      if (firstLevel) {
        thread.date = prevTime;
        const list = thread[finally$];
        thread[success$] = thread[abort$] = thread[finally$] = void 0;
        if (list) for (let i = 0; i < list.length; ++i) {
          await list[i]();
        }
      }
    }
  };

  const TransQueue = {
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
            list[i]();
          }
        }
        throw ex;
      } finally {
        if (firstLevel) {
          thread.date = prevTime;
          const list = thread[finally$];
          thread[success$] = thread[abort$] = thread[finally$] = void 0;
          if (list) for (let i = 0; i < list.length; ++i) {
            list[i]();
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
