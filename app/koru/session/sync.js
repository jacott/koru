define(function(require, exports, module) {
  var util = require('koru/util');
  var makeSubject = require('../make-subject');

  var count = 0;

  var sync = makeSubject({
    waiting: function () {
      return count !== 0;
    },

    inc: function () {
      if (++count === 1)
        sync.notify(true);
    },

    dec: function () {
      if (--count === 0)
        sync.notify(false);
      else if (count === -1) {
        count = 0;
        throw new Error("Unexpected dec when no outstanding waits");
      }
    },

    _resetCount: function () {
      count = 0;
    },
  });

  return sync;
});
