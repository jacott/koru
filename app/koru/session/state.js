define(function(require, exports, module) {
  var util = require('../util');
  var makeSubject = require('../make-subject');

  var state = 'closed';
  var count = 0;

  util.extend(exports, {
    _onConnect: {},

    onConnect: function (priority, func) {
      (this._onConnect[priority] || (this._onConnect[priority] = [])).push(func);
    },

    stopOnConnect: function (priority, func) {
      var index = util.removeItem(this._onConnect[priority] || [], func);
    },

    connected: function (conn) {
      state = 'ready';
      var onConnect = this._onConnect;
      Object.keys(onConnect).sort().forEach(function (priority) {
        onConnect[priority].forEach(function (func) {
          func.call(conn);
        });
      });
      this.notify(true);
    },

    close: function () {
      if (state !== 'closed') {
        state = 'closed';
        this.notify(false);
      }
    },

    retry: function () {
      if (state !== 'retry') {
        state = 'retry';
        this.notify(false);
      }
    },

    isReady: function() {return state === 'ready'},
    isClosed: function() {return state === 'closed'},

    get _state() {return state},
    set _state(value) {state = value},

    inSync: function () {
      return count !== 0;
    },

    pending: makeSubject({}),

    incPending: function () {
      if (++count === 1)
        this.pending.notify(true);
    },

    decPending: function () {
      if (--count === 0)
        this.pending.notify(false);
      else if (count === -1) {
        count = 0;
        throw new Error("Unexpected dec when no outstanding waits");
      }
    },

    _resetPendingCount: function () {
      count = 0;
    },

  });

  makeSubject(exports);
});
