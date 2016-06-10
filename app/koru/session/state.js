define(function(require, exports, module) {
  var util = require('../util');
  var makeSubject = require('../make-subject');
  var koru = require('koru');
  var Trace = require('../trace');

  function Constructor() {
    var state = 'startup';
    var count = 0;

    var debug_pending = false;

    Trace.debug_pending = function (value) {
      if (value) {
        koru._incPendingStack = [];
        koru._decPendingStack = [];
        debug_pending = true;
      } else {
        koru._incPendingStack = null;
        koru._decPendingStack = null;
        debug_pending = false;
      }
    };

    return makeSubject({
      _onConnect: {},

      onConnect: function (priority, func) {
        if (priority in this._onConnect)
          throw new Error("priority " + priority + " already taken for onConnect");
        this._onConnect[priority] = func;
      },

      stopOnConnect: function (priority) {
        delete this._onConnect[priority];
      },

      connected: function (session) {
        this.session = session;
        state = 'ready';
        var onConnect = this._onConnect;
        util.forEach(Object.keys(onConnect).sort(), function (priority) {
          onConnect[priority](session);
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
        if (was !== 'retry')
          this.notify(false);
      },

      isReady: function() {return state === 'ready'},
      isClosed: function() {return state === 'closed'},

      get _state() {return state},
      set _state(value) {state = value},

      pendingCount: function() {return count},

      pending: makeSubject({}),

      incPending: function () {
        debug_pending && koru._incPendingStack.push(util.extractError(new Error(count)));
        if (++count === 1)
          this.pending.notify(true);
      },

      decPending: function () {
        debug_pending && koru._decPendingStack.push(util.extractError(new Error(count)));
        if (--count === 0) {
          if (debug_pending) {
            koru.debug_pending(true);
          }
          this.pending.notify(false);
        } else if (count === -1) {
          count = 0;
          throw new Error("Unexpected dec when no outstanding waits");
        }
      },

      // for test use only
      _resetPendingCount: function () {
        count = 0;
      },

    });
  }

  exports = Constructor();
  exports.__init__ = Constructor;

  return exports;
});
