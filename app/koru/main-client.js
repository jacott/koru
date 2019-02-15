define((require, exports, module)=>{
  const pep = require('koru/polyfill/maybe-pep');
  const util = require('./util-client');

  const TWENTY_DAYS = 20*util.DAY;

  return koru =>{
    // avoid search for de-bug statements
    window['_koru'+'_'] = koru;
    window['k'+'dbg'] = koru["\x64ebug"];

    koru.onunload(module, 'reload');

    util.merge(koru, {
      global: window,
      reload() {
        if (koru.loadError) throw koru.loadError;

        (window.top || window).location.reload(true);
      },

      appDir: module.toUrl('').slice(0,-1),

      setTimeout(func, duration) {
        if (duration > 2147483640) throw new Error('duration too big');
        return setTimeout(()=> {
          try {
            func();
          } catch(ex) {
            koru.unhandledException(ex);
          }
        }, duration);
      },

      runFiber(func) {
        try {
          func();
        } catch(ex) {
          koru.unhandledException(ex);
        }
      },

      fiberConnWrapper(func, conn, data) {
        try {
          func(conn, data);
        } catch(ex) {
          koru.unhandledException(ex);
        }
      },

      getLocation() {
        return window.location;
      },

      afTimeout(func, duration) {
        let af = null;
        let cancel;
        const endTime = duration > TWENTY_DAYS ?
              Date.now() + duration : 0;
        const inner = ()=>{
          if (endTime !== 0) {
            const now = Date.now();
            if (endTime > now) {
              cancel = setTimeout(inner, Math.min(endTime - now, TWENTY_DAYS));
              return;
            }
          }
          cancel = 0;
          af = window.requestAnimationFrame(() => {
            af = null;
            try {
              func();
            } catch(ex) {
              koru.unhandledException(ex);
            }
          });
        };

        if (duration !== undefined && duration > 0)
          cancel = setTimeout(inner, endTime === 0 ? duration : TWENTY_DAYS);
        else
          inner();

        return ()=>{
          if (cancel !== 0) {
            window.clearTimeout(cancel);
            cancel = 0;
          }
          if (af !== null) {
            window.cancelAnimationFrame(af);
            af = null;
          }
        };
      },
    });

    /**
     * _afTimeout is used by client session; do not override in tests
     **/
    koru._afTimeout = koru.afTimeout;
  };
});
