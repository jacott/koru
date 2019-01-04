define(require =>{
  const util  = require('koru/util');

  const success$ = Symbol(), abort$ = Symbol();
  let lastTime = null;

  const TransQueue = {
    transaction(db, body) {
      let prevTime;
      let list = util.thread[success$];
      const firstLevel = list === undefined;
      if (firstLevel) {
        list = util.thread[success$] = [];
        prevTime = util.thread.date;
        let now = util.dateNow();
        if (now === lastTime)
          now = lastTime+=1;
        util.thread.date = lastTime = now;
      }
      try {
        const result = body === undefined ?
              db() : db.transaction(tx => body.call(db, tx));
        if (firstLevel) {
          util.thread[success$] = undefined;
          for(let i = 0; i < list.length; ++i) {
            list[i]();
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
          util.thread[success$] = util.thread[abort$] = undefined;
        }
      }
    },

    onSuccess(func) {
      const list = util.thread[success$];
      if (list !== undefined)
        list.push(func);
      else
        func();
    },

    onAbort(func) {
      if (util.thread[success$] === undefined) return;
      const list = util.thread[abort$];
      if (list === undefined)
        util.thread[abort$] = [func];
      else
        list.push(func);
    },

    isInTransaction() {
      return util.thread[success$] !== undefined;
    },

    _clearLastTime() {lastTime = null},
  };


  return TransQueue;
});
