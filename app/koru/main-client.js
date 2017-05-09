define(function(require, exports, module) {
  require('koru/polyfill/pep');
  const util = require('./util-client');

  return function (koru) {
    window['_koru'+'_'] = koru; // avoid search for de-bug statements

    koru.onunload(module, 'reload');

    util.merge(koru, {
      global: window,
      reload() {
        if (koru.loadError) throw koru.loadError;

        (window.top || window).location.reload(true);
      },

      Fiber: util.Fiber,

      appDir: module.toUrl('').slice(0,-1),

      setTimeout(func, duration) {
        return setTimeout(function () {
          try {
            func();
          } catch(ex) {
            koru.error(util.extractError(ex));
          }
        }, duration);
      },

      fiberConnWrapper(func, conn, data) {
        try {
          func(conn, data);
        } catch(ex) {
          koru.error(util.extractError(ex));
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
              koru.error(util.extractError(ex));
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
