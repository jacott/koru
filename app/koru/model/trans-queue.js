define(function(require) {
  const util  = require('koru/util');

  const success$ = Symbol(), abort$ = Symbol();
  let lastTime;

  const TransQueue = {
    transaction(db, body) {
      let prevTime;
      let list = util.thread[success$];
      const firstLevel = ! list;
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
          util.thread[success$] = null;
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
          util.thread[success$] = util.thread[abort$] = null;
        }
      }
    },

    onSuccess(func) {
      const list = util.thread[success$];
      if (list)
        list.push(func);
      else
        func();
    },

    onAbort(func) {
      if (! util.thread[success$]) return;
      const list = util.thread[abort$];
      if (list)
        list.push(func);
      else
        util.thread[abort$] = [func];
    },

    _clearLastTime() {lastTime = null},
  };


  return TransQueue;
});
