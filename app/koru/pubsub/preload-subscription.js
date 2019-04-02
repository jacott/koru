define((require, exports, module)=>{
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
      } else
        return (this[onConnect$] || (this[onConnect$] = new Observable())).add(callback);
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

    preload(idb, preloadComplete) {preloadComplete(null)}
    getQueryIDB() {}
    serverResponse(err, idb) {}

    async connect() {
      try {
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

        let ignorePreload = false, serverFinished = false;

        this.onServerConnect((err) => {
          serverFinished = true;
          this.serverResponse(err, idb);
          ignorePreload && finished(err);
        });
        if (idb === void 0)
          ignorePreload = true;
        else {
          if (! idb.isReady) await idb.whenReady();
          ignorePreload = 'ignorePreload' === await this.preload(idb, (err, _ignorePreload)=>{
            if (_ignorePreload !== 'ignorePreload' || serverFinished)
              finished(err);
            else
              ignorePreload = true;
          });
        }

        super.connect();
      } catch (ex) {
        this.stop(ex);
      }
    }
  }

  return PreloadSubscription;
});
