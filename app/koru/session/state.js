define((require)=>{
  const koru            = require('koru');
  const makeSubject     = require('koru/make-subject');
  const Observable      = require('koru/observable');
  const Trace           = require('koru/trace');
  const util            = require('koru/util');

  function stateFactory() {
    let state = 'startup';
    let count = 0;
    let updateCount = 0;

    let debug_pending = false;

    Trace.debug_pending = (value)=>{
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

    const setState = (self, value)=>{
      const was = state;
      state = value;
      was === 'ready' && was !== value && self.notify(false);
    };

    const sessionState = {
      constructor: stateFactory,
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
        const onConnect = this._onConnect;
        util.forEach(Object.keys(onConnect).sort(), priority =>{onConnect[priority](session)});
        this.notify(true);
      },

      close() {setState(this, 'closed')},
      pause() {setState(this, 'paused')},

      retry(code, reason) {
        const was = state;
        state = 'retry';
        if (was !== 'retry')
          this.notify(false, code, reason);
      },

      isReady() {return state === 'ready'},
      isClosed() {return state === 'closed'},
      isPaused() {return state === 'paused'},

      get _state() {return state},
      set _state(value) {state = value},

      pendingCount() {return count},
      pendingUpdateCount() {return updateCount},

      pending: new Observable(),

      incPending(isUpdate) {
        debug_pending && koru._incPendingStack.push(
          util.extractError(new Error(`${count} ${isUpdate}`)));
        if (isUpdate) ++updateCount;
        if (++count === 1)
          this.pending.notify(true);
      },

      decPending(isUpdate) {
        debug_pending && koru._decPendingStack.push(
          util.extractError(new Error(`${count} ${isUpdate}`)));
        if (isUpdate) --updateCount;
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
    };

    return makeSubject(sessionState);
  }

  return  stateFactory();
});
