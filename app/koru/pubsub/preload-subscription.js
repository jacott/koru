define((require, exports, module)=>{
  const Observable      = require('koru/observable');
  const Subscription    = require('koru/pubsub/subscription');

  const onConnect$ = Symbol();

  class PreloadSubscription extends Subscription {
    onConnect(callback) {
      return (this[onConnect$] || (this[onConnect$] = new Observable())).add(callback);
    }

    preload(idb, preloadComplete) {}
    getQueryIDB() {}
    serverResponse(err, idb) {}

    async connect() {
      try {
        const finished = (err=null) => {
          const onConnect = this[onConnect$];
          if (onConnect !== void 0) {
            this[onConnect$] = void 0;
            onConnect.notify(err);
          }
        };

        const idb = this.getQueryIDB();

        super.onConnect((err) => {
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
