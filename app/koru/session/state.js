define(function(require, exports, module) {
  var util = require('../util');
  var makeSubject = require('../make-subject');

  var state = 'closed';
  var count = 0;

  util.extend(exports, {
    _onConnect: {},

    onConnect: function (priority, func) {
      if (priority in this._onConnect)
        throw new Error("priority " + priority + " already taken for onConnect");
      this._onConnect[priority] = func;
    },

    stopOnConnect: function (priority, func) {
      delete this._onConnect[priority];
    },

    connected: function (conn) {
      state = 'ready';
      var onConnect = this._onConnect;
      Object.keys(onConnect).sort().forEach(function (priority) {
        onConnect[priority].call(conn);
      });
      this.notify(true);
    },

    close: function () {
      var was = state;
      state = 'closed';
      if (was === 'ready')
        this.notify(false);
    },

    retry: function () {
      var was = state;
      state = 'retry';
      if (was === 'ready')
        this.notify(false);
    },

    isReady: function() {return state === 'ready'},
    isClosed: function() {return state === 'closed'},

    get _state() {return state},
    set _state(value) {state = value},

    pendingCount: function() {return count},

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
