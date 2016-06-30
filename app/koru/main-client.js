window.isClient = true;
window.isServer = false;

define(function(require, exports, module) {
  var util = require('./util-client');
  var koru = window._koru_ = require('./main');

  koru.reload = function () {
    if (koru.loadError) throw koru.loadError;

    (window.top || window).location.reload(true);
  };

  koru.Fiber = util.Fiber;

  koru.appDir = module.toUrl('').slice(0,-1);

  koru.setTimeout = function (func, duration) {
    return setTimeout(function () {
      try {
        func();
      } catch(ex) {
        koru.error(util.extractError(ex));
      }
    }, duration);
  };


  koru.getLocation = function () {
    return window.location;
  };

  koru.onunload(module, 'reload');

  // _afTimeout is used by client session; do not override in tests
  koru._afTimeout = koru.afTimeout = function (func, duration) {
    var af = null;
    if (duration && duration > 0)
      var timeout = setTimeout(inner, duration);
    else
      inner();

    function inner() {
      timeout = null;
      af = window.requestAnimationFrame(function () {
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
  };

  return koru;
});
