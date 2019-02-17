define((require, exports, module)=>{
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
        callback(this.error);
        return util.noopHandle;
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

    preload(idb, preloadComplete) {}
    getQueryIDB() {}
    serverResponse(err, idb) {}

    async connect() {
      try {
        const finished = (err=null) => {
          this[state$] = 'active';
          const onConnect = this[onConnect$];
          if (onConnect !== void 0) {
            this[onConnect$] = void 0;
            onConnect.notify(err);
          }
        };

        const idb = this.getQueryIDB();

        this.onServerConnect((err) => {
          this.serverResponse(err, idb);
          finished(err);
        });
        if (idb !== void 0) {
          if (! idb.isReady) await idb.whenReady();
          await this.preload(idb, finished);
        }

        super.connect();
      } catch (ex) {
        this.stop(ex);
      }
    }
  }

  return PreloadSubscription;
});
