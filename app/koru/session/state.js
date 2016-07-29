define(function(require, exports, module) {
  const koru        = require('koru');
  const makeSubject = require('koru/make-subject');
  const Trace       = require('koru/trace');
  const util        = require('koru/util');

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

      onConnect(priority, func) {
        if (priority in this._onConnect)
          throw new Error("onConnect " + priority + " already taken for onConnect");
        this._onConnect[priority] = func;
      },

      stopOnConnect(priority) {
        delete this._onConnect[priority];
      },

      connected(session) {
        this.session = session;
        state = 'ready';
        var onConnect = this._onConnect;
        util.forEach(Object.keys(onConnect).sort(), function (priority) {
          onConnect[priority](session);
        });
        this.notify(true);
      },

      close() {
        let was = state;
        state = 'closed';
        if (was === 'ready')
          this.notify(false);
      },

      retry(code, reason) {
        var was = state;
        state = 'retry';
        if (was !== 'retry')
          this.notify(false, code, reason);
      },

      isReady() {return state === 'ready'},
      isClosed() {return state === 'closed'},

      get _state() {return state},
      set _state(value) {state = value},

      pendingCount() {return count},

      pending: makeSubject({}),

      incPending() {
        debug_pending && koru._incPendingStack.push(util.extractError(new Error(count)));
        if (++count === 1)
          this.pending.notify(true);
      },

      decPending() {
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
      _resetPendingCount() {
        count = 0;
      },

    });
  }

  exports = Constructor();
  exports.__init__ = Constructor;

  return exports;
});
