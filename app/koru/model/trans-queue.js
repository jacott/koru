define(require =>{
  const util  = require('koru/util');

  const success$ = Symbol(), abort$ = Symbol();
  let lastTime = null;

  const TransQueue = {
    transaction(db, body) {
      let prevTime;
      let list = util.thread[success$];
      const firstLevel = list === void 0;
      if (firstLevel) {
        list = util.thread[success$] = [];
        prevTime = util.thread.date;
        let now = util.dateNow();
        if (now === lastTime)
          now = lastTime+=1;
        util.thread.date = lastTime = now;
      }
      try {
        const result = body === void 0 ?
              db() : db === void 0 ? body() : db.transaction(tx => body.call(db, tx));
        if (firstLevel) {
          while (list != null) {
            const l = list;
            list = void 0;
            util.thread[success$] = null;

            for(let i = 0; i < l.length; ++i) l[i]();
            list = util.thread[success$];
          }
        }
        return result;
      } catch (ex) {
        if (firstLevel) {
          const list = util.thread[abort$];
          if (list) for(let i = 0; i < list.length; ++i) {
            list[i]();
          }
        }
        throw ex;
      } finally {
        if (firstLevel) {
          util.thread.date = prevTime;
          util.thread[success$] = util.thread[abort$] = void 0;
        }
      }
    },

    onSuccess(func) {
      let list = util.thread[success$];
      if (list !== void 0) {
        if (list === null) list = util.thread[success$] = [];
        list.push(func);
      } else
        func();
    },

    onAbort(func) {
      if (util.thread[success$] === void 0) return;
      const list = util.thread[abort$];
      if (list === void 0)
        util.thread[abort$] = [func];
      else
        list.push(func);
    },

    isInTransaction() {
      return util.thread[success$] !== void 0;
    },

    _clearLastTime() {lastTime = null},
  };


  return TransQueue;
});
