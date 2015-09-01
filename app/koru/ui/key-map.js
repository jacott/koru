define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  function KeyMap() {
    this.map = {};
  }

  exports = function (funcs) {
    var keyMap = new KeyMap();
    var top = keyMap.map;

    function procMod() {
      if (mod) {
        mod = String.fromCharCode(mod);
        km = km[mod] || (km[mod] = {});
        mod = 0;
      }
    }

    for(var name in funcs) {
      var keySeq = funcs[name][0];
      var km = top;
      var mod = 0;
      for(var i = 0; i < keySeq.length - 1; ++i) {
        var code = keySeq[i];
        var modk = MODIFIERS[code];

        if (modk) {
          mod = mod | modk;
          continue;
        }
        procMod();
        km = km[code] || (km[code] = {});
        if (Array.isArray(km)) throw new Error("Not a key map for: '" + keySeq.slice(0,i + 1) + "' => " + km);
      }
      procMod();

      km[keySeq[i]] = [name, funcs[name][1]];
    }
    keyMap.exec = exec.bind(keyMap);

    return keyMap;
  };

  var MODIFIERS = {};

  addModifiers(
    exports.shift = '\u0010',
    exports.ctrl = '\u0011',
    exports.alt = '\u0012'
  );

  function addModifiers() {
    util.forEach(arguments, function (code, i) {
      MODIFIERS[code] = 1 << i;
    });
  }

  function exec(event, ignoreFocus) {
    if (ignoreFocus !== 'ignoreFocus' && Dom.matches(document.activeElement, Dom.INPUT_SELECTOR))
      return;

    var keyMap = this;
    var code = String.fromCharCode(event.which);
    var modk = MODIFIERS[code];

    if (modk) {
      var mod = modk;
      var map = keyMap.map;
    } else {
      var mod = 0;
      var map = keyMap.map[String.fromCharCode(event.which)];
      if (! map) return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (Array.isArray(map)) {
      map[1](map[0]);
    } else {
      window.addEventListener('keydown', nextKey, true);
      window.addEventListener('keyup', endKey, true);
      document.body.addEventListener('mouseleave', cancel, true);

      function endKey(event) {
        var modk = MODIFIERS[(String.fromCharCode(event.which))];
        if (modk) mod -= modk;
      }

      function nextKey(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        var code = String.fromCharCode(event.which);
        var modk = MODIFIERS[code];

        if (modk) {
          mod = mod | modk;
          return;
        }

        if (mod) {
          map = map[String.fromCharCode(mod)];
          mod = 0;
          if (! map || Array.isArray(map)) {
            cancel();
            return;
          }
        }

        map = map[String.fromCharCode(event.which)];
        if (map && ! Array.isArray(map)) {
          return;
        }
        cancel();
        map && map[1](map[0]);
      }

      function cancel() {
        window.removeEventListener('keydown', nextKey, true);
        window.removeEventListener('keyup', endKey, true);
        document.body.removeEventListener('mouseleave', cancel, true);
      }
    }
  }

  return exports;
});
