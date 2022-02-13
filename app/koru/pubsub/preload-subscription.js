define((require, exports, module) => {
  'use strict';
  const Observable      = require('koru/observable');
  const Subscription    = require('koru/pubsub/subscription');
  const util            = require('koru/util');

  const onConnect$ = Symbol(), state$ = Symbol();

  class PreloadSubscription extends Subscription {
    constructor(args, session) {
      super(args, session);
      this[state$] = null;
    }
    onConnect(callback) {
      if (this.state === 'active' || this.state === 'stopped') {
        super.onConnect(callback);
      } else {
        return (this[onConnect$] || (this[onConnect$] = new Observable())).add(callback);
      }
    }

    get state() {
      const me = this[state$];
      const p = super.state;
      return me !== null && p === 'connect' ? me : p;
    }

    get isServerConnected() {
      return super.state === 'active';
    }

    onServerConnect(callback) {return super.onConnect(callback);}

    preload(idb) {}
    getQueryIDB() {}
    serverResponse(err, idb) {}

    async connect() {
      const finished = (err=null) => {
        if (this[state$] === 'active') return;
        this[state$] = 'active';
        const onConnect = this[onConnect$];
        if (onConnect !== void 0) {
          this[onConnect$] = void 0;
          onConnect.notify(err);
        }
      };

      const idb = this.getQueryIDB();

      try {
        let nextAction = 'waitServer';
        if (idb !== void 0) {
          if (! idb.isReady) await idb.whenReady();
          nextAction = await this.preload(idb);
          if (nextAction === 'skipServer') {
            finished(null);
            return;
          }
        }
        this.onServerConnect((err) => {
          this.serverResponse(err, idb);
          finished(err);
        });
        super.connect();
        if (nextAction !== 'waitServer') {
          finished(null);
        }
      } catch (err) {
        finished(err);
      }
    }
  }

  return PreloadSubscription;
});
