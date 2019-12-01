define((require)=>{
  const koru            = require('koru');
  const makeSubject     = require('koru/make-subject');

  const onChange$ = Symbol(), notify$ = Symbol();

  let serviceWorker;
  let prepareNewVersionPromise;

  const onmessage = event =>{
    switch(event.data.action) {
    case 'reload':
      koru.reload();
      break;
    case 'baseLoaded':
      const promise = prepareNewVersionPromise;
      if (promise !== void 0) {
        prepareNewVersionPromise = void 0;
        promise.resolve();
      }
      break;
    }
  };

  const prepareNewVersion = (hash=window.KORU_APP_VERSION)=>{
    if (prepareNewVersionPromise !== void 0) return prepareNewVersionPromise;
    let resolve;
    prepareNewVersionPromise = new Promise((r)=>{resolve = r});
    prepareNewVersionPromise.resolve = resolve;

    const {waiting, active} = SWManager.registration || {};
    const sw = waiting || active;
    if (sw != null) {
      const version = (hash || `dev,${Date.now()}`);
      const idx = version.indexOf(',');
      sw.postMessage({action: 'loadBase', search: '?'+version.slice(idx+1)});
    }
    return prepareNewVersionPromise;
  };

  const SWManager = makeSubject({
    start() {
      if (serviceWorker !== void 0) return;
      serviceWorker = navigator.serviceWorker;
      if (serviceWorker === void 0) return;

      this.isActive = serviceWorker.controller != null;

      serviceWorker.addEventListener('message', onmessage);

      const SW_NAME = '/service-worker.js';

      if (serviceWorker.controller !== null && ! serviceWorker.controller.scriptURL.endsWith(SW_NAME)) {
        koru.unregisterServiceWorker();
        return;
      }

      serviceWorker.register(SW_NAME).then(reg =>{
        this.registration = reg;

        const trackInstalling = ()=>{
          const pending = this.pending = reg.installing || reg.waiting;
          if (! pending) return;

          const statechange = ()=>{
            switch (pending.state) {
            case 'installed':
              this.isActive && this[notify$](this.installed = pending);
              break;
            case 'activated':
              if (this.isActive)
                koru.reload();
              else {
                this.isActive = serviceWorker.controller != null;
                prepareNewVersion();
              }
              break;
            }
          };
          pending.addEventListener('statechange', statechange);
        };

        reg.addEventListener('updatefound', trackInstalling);

      }).catch(koru.globalErrorCatch);
    },

    stop() {
      if (serviceWorker === void 0) return;
      serviceWorker.removeEventListener('message', onmessage);
      serviceWorker = void 0;
      this.installed = this.waiting = null;
      this.registration = null;
    },

    installed: null, waiting: null,
    registration: null,

    update() {
      return Promise.resolve(this.registration && this.registration.update());
    },

    onUpdateWaiting(callback) {
      const handle = this[onChange$](callback);
      const {registration} = this;
      if (registration !== null && registration.installing == null && registration.waiting != null)
        callback(registration.waiting);
      return handle;
    },

    sendMessage(message, worker=serviceWorker.controller) {
      return new Promise((resolve, reject) => {
        const messageChannel = new window.MessageChannel();
        messageChannel.port1.onmessage = event =>{
          if (event.data.error) {
            reject(event.data.error);
          } else {
            resolve(event.data);
          }
        };
        worker.postMessage(
          message, [messageChannel.port2]);
      });
    },

    prepareNewVersion,

    loadNewVersion() {
      if (this.registration === null) {
        koru.reload();
        return;
      }
      const {installing, waiting, active} = this.registration;
      const sw = waiting || active;
      if (installing != null || sw == null) {
        SWManager.onUpdateWaiting(()=>{SWManager.loadNewVersion()});
        installing == null && SWManager.update();
      } else {
        sw.postMessage({action: 'reload'});
      }
    },
  }, onChange$, notify$);

  return SWManager;
});
