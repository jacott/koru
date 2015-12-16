define(function(require, exports, module) {
  var util = require('../util');
  var Dom = require('../dom');

  function KeyMap() {
    this.map = {};
    this.descMap = {};
  }

  exports = function (funcs) {
    var keyMap = new KeyMap();
    keyMap.exec = exec.bind(keyMap);

    keyMap.addKeys(funcs);

    return keyMap;
  };

  KeyMap.prototype = {
    constructor: KeyMap,
    addKeys: function (funcs) {
      var keyMap = this;
      var top = keyMap.map;

      function procMod() {
        if (mod) {
          mod = String.fromCharCode(mod);
          km = km[mod] || (km[mod] = {});
          mod = 0;
        }
      }

      for(var name in funcs) {
        var line = funcs[name];
        var keySeq = line[0];
        var km = top;
        var mod = 0;
        this.descMap[name] = [keySeq, line[1]];
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

        km[keySeq[i]] = [name, line[1]];
      }
    },

    getTitle: function(desc, name) {
      var sc = this.descMap[name];
      if (! sc) return (this.descMap[name]=['', null, desc])[2];
      return sc[2] || (sc[2] = makeTitle(desc, sc[0]));
    },
  };

  function makeTitle(name, keySeq) {
    keySeq = keySeq.replace(/[\u0010-\u002B]/g, function (m) {
      var mc = MOD_NAMES[m];
      if (mc)
        return mc+'-';
      else
        return "<"+SYM_NAMES[m]+">";
    });
    return keySeq ? name + ' ['+keySeq+']' : name;
  }

  var MODIFIERS = {};
  var MOD_NAMES = {};
  var SYM_NAMES = {};

  addModifiers(
    '\u0010shift',
    '\u0011ctrl',
    '\u0012alt'
  );

  function addModifiers() {
    util.forEach(arguments, function (code, i) {
      var name = code.slice(1);
      exports[name] = code = code[0];
      MODIFIERS[code] = 1 << i;
      SYM_NAMES[code] = name;
      MOD_NAMES[code] = name;
    });
  }

  addCodes(
    '\u0025left',
    '\u0026up',
    '\u0027right',
    '\u0028down',
    '\u0021pgUp',
    '\u0022pgDown',
    '\u0023end',
    '\u0024home',
    '\u001Besc',
    '\u002Edel'
  );

  function addCodes() {
    util.forEach(arguments, function (code, i) {
      var name = code.slice(1);
      exports[name] = code = code[0];
      SYM_NAMES[code] = name;
    });
  }

  exports.modCodeToName = function (code) {
    return MOD_NAMES[code];
  };

  function exec(event, ignoreFocus) {
    if (ignoreFocus !== 'ignoreFocus' && Dom.matches(document.activeElement, Dom.INPUT_SELECTOR))
      return;

    var keyMap = this;
    var code = String.fromCharCode(event.which);
    if (MODIFIERS[code]) return;

    var mod = eventMod(event);

    if (mod) {
      var map = keyMap.map[String.fromCharCode(mod)];
      if (! map) return;
    } else {
      map = keyMap.map;
    }

    map = map[String.fromCharCode(event.which)];
    if (! map) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (Array.isArray(map)) {
      map[1](map[0]);
    } else {
      window.addEventListener('keydown', nextKey, true);
      document.body.addEventListener('mouseleave', cancel, true);
    }

    function nextKey(event) {
      var code = String.fromCharCode(event.which);
      if (MODIFIERS[code]) return;

      mod = eventMod(event);

      if (mod) {
        map = map[String.fromCharCode(mod)];
        if (! map) {
          cancel();
          return;
        }
      }

      map = map[String.fromCharCode(event.which)];
      if (map && ! Array.isArray(map)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      cancel();
      if (! map) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      map[1](map[0]);
    }

    function cancel() {
      window.removeEventListener('keydown', nextKey, true);
      document.body.removeEventListener('mouseleave', cancel, true);
    }

  }

  function eventMod(event) {
    var mod = 0;
    if (event.shiftKey) mod = 1;
    if (event.ctrlKey) mod += 2;
    if (event.altKey) mod += 4;
    return mod;
  }

  return exports;
});
