define(function(require) {
  const util  = require('koru/util');

  const successMap = new WeakMap;
  const abortMap = new WeakMap;
  let lastTime;

  const TransQueue = {
    transaction(db, body) {
      let list = successMap.get(util.thread);
      const firstLevel = list === undefined;
      if (firstLevel) {
        successMap.set(util.thread, list = []);
        var prevTime = util.thread.date;
        let now = util.dateNow();
        if (now === lastTime)
          now = lastTime+=1;
        util.thread.date = lastTime = now;
      }
      try {
        var result = db.transaction(tx => body.call(db, tx));
        if (firstLevel) {
          successMap.set(util.thread, false);
          list.forEach(f => f());
        }
        return result;
      } catch (ex) {
        if (firstLevel) {
          let list = abortMap.get(util.thread);
          list && list.forEach(f => f());
        }
        throw ex;
      } finally {
        if (firstLevel) {
          util.thread.date = prevTime;
          successMap.delete(util.thread);
          abortMap.delete(util.thread);
        }
      }
    },

    onSuccess(func) {
      const list = successMap.get(util.thread);
      if (list)
        list.push(func);
      else
        func();
    },

    onAbort(func) {
      let list = abortMap.get(util.thread);
      if (! list) abortMap.set(util.thread, list = []);
      list.push(func);
    },
  };


  return TransQueue;
});
