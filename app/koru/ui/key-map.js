define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  function KeyMap() {
    this.map = {};
  }

  return function (funcs) {
    var keyMap = new KeyMap();
    var top = keyMap.map;

    for(var name in funcs) {
      var keySeq = funcs[name][0];
      var km = top;
      for(var i = 0; i < keySeq.length - 1; ++i) {
        var code = keySeq.charCodeAt(i);
        km = km[code] || (km[code] = {});
        if (Array.isArray(km)) throw new Error("Not a key map for: '" + keySeq.slice(0,i + 1) + "' => " + km);
      }

      km[keySeq.charCodeAt(i)] = [name, funcs[name][1]];
    }
    keyMap.exec = exec.bind(keyMap);

    return keyMap;
  };

  function exec(event, ignoreFocus) {
    if (ignoreFocus !== 'ignoreFocus' && Dom.matches(document.activeElement, Dom.INPUT_SELECTOR))
      return;

    var keyMap = this;
    var map = keyMap.map[event.which];
    if (! map) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (Array.isArray(map)) {
      map[1](map[0]);
    } else {
      window.addEventListener('keydown', nextKey, true);
      document.body.addEventListener('mouseleave', cancel, true);

      function nextKey(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        map = map[event.which];
        if (map && ! Array.isArray(map)) {
          return;
        }
        cancel();
        map && map[1](map[0]);
      }

      function cancel() {
        window.removeEventListener('keydown', nextKey, true);
        document.body.removeEventListener('mouseleave', cancel, true);
      }
    }
  }
});
