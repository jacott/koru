define(function(require, exports, module) {
  const pep = require('koru/polyfill/pep');
  const util = require('./util-client');

  if (pep.PointerEvent === window.PointerEvent)
    window.PointerEvent.pep = true;

  return function (koru) {
    window['_koru'+'_'] = koru; // avoid search for de-bug statements

    koru.onunload(module, 'reload');

    util.merge(koru, {
      global: window,
      reload() {
        if (koru.loadError) throw koru.loadError;

        (window.top || window).location.reload(true);
      },

      appDir: module.toUrl('').slice(0,-1),

      setTimeout(func, duration) {
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
        let timeout;
        if (duration && duration > 0)
          timeout = setTimeout(inner, duration);
        else
          inner();

        function inner() {
          timeout = null;
          af = window.requestAnimationFrame(() => {
            af = null;
            try {
              func();
            } catch(ex) {
              koru.unhandledException(ex);
            }
          });
        }

        return function () {
          if (timeout) window.clearTimeout(timeout);
          if (af) window.cancelAnimationFrame(af);
          af = timeout = null;
        };
      },
    });

    /**
     * _afTimeout is used by client session; do not override in tests
     **/
    koru._afTimeout = koru.afTimeout;
  };
});
