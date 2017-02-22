define(function(require) {
  const util  = require('koru/util');

  const successSym = Symbol();
  const abortSym = Symbol();
  let lastTime;

  const TransQueue = {
    transaction(db, body) {
      let prevTime;
      let list = util.thread[successSym];
      const firstLevel = ! list;
      if (firstLevel) {
        list = util.thread[successSym] = [];
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
          util.thread[successSym] = null;
          for(let i = 0; i < list.length; ++i) {
            list[i]();
          }
        }
        return result;
      } catch (ex) {
        if (firstLevel) {
          const list = util.thread[abortSym];
          if (list) for(let i = 0; i < list.length; ++i) {
            list[i]();
          }
        }
        throw ex;
      } finally {
        if (firstLevel) {
          util.thread.date = prevTime;
          util.thread[successSym] = util.thread[abortSym] = null;
        }
      }
    },

    onSuccess(func) {
      const list = util.thread[successSym];
      if (list)
        list.push(func);
      else
        func();
    },

    onAbort(func) {
      if (! util.thread[successSym]) return;
      const list = util.thread[abortSym];
      if (list)
        list.push(func);
      else
        util.thread[abortSym] = [func];
    },

    _clearLastTime() {lastTime = null},
  };


  return TransQueue;
});
