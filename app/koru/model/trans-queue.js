define(function(require) {
  const util  = require('koru/util');

  const Map = new WeakMap;

  const TransQueue = {
    transaction(db, body) {
      let array = Map.get(util.thread);
      let firstLevel = ! array;
      if (firstLevel)
        Map.set(util.thread, array = []);
      try {
        var result = db.transaction(tx => body.call(db, tx));
        if (firstLevel)
          array.forEach(func => func());
        return result;
      } finally {
        if (firstLevel)
          Map.delete(util.thread);
      }
    },

    push(func) {
      var array = Map.get(util.thread);
      if (array)
        array.push(func);
      else
        func();
    },
  };


  return TransQueue;
});
