window.isClient = true;
window.isServer = false;

define(function(require, exports, module) {
  var util = require('./util-client');
  var koru = window._koru_ = require('./main');

  koru.discardIncompleteLoads = function (error) {
    var list = document.head.querySelectorAll('script[data-requiremodule]');
    var badIds = [];
    koru.loadError = error;
    try {
      for(var i = 0; i < list.length; ++i) {
        var elm = list[i];
        var modId = elm.getAttribute('data-requiremodule');
        if (modId && ! koru.loaded.hasOwnProperty(modId)) {
          koru.unload(modId, error);
          badIds.push("\tat "+modId+".js:1");
        }
      }
    } finally {
      koru.loadError = null;
    }
    return badIds;
  };

  koru.reload = function () {
    if (koru.loadError) throw koru.loadError;

    window.location.reload(true);
    throw "reloading"; // no point continuing
  };

  koru.appDir = require.toUrl('').slice(0,-1);

  koru.setTimeout = function (func, duration) {
    return setTimeout(function () {
      try {
        func();
      } catch(ex) {
        koru.error(util.extractError(ex));
      }
    }, duration);
  };


  koru.afTimeout = function (func, duration) {
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