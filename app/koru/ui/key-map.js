define(function(require, exports, module) {
  const Dom  = require('../dom');
  const util = require('../util');

  const MODIFIERS = {};
  const MOD_NAMES = {};
  const SYM_NAMES = {};

  exports = module.exports = function (funcs) {
    const keyMap = new KeyMap();
    keyMap.exec = exec.bind(keyMap);

    keyMap.addKeys(funcs);

    return keyMap;
  };

  class KeyMap {
    constructor() {
      this.map = {};
      this.descMap = {};
    }

    addKeys(funcs) {
      const top = this.map;
      let mod, km;

      function procMod() {
        if (mod) {
          mod = String.fromCharCode(mod);
          km = km[mod] || (km[mod] = {});
          mod = 0;
        }
      }

      for(let name in funcs) {
        const line = funcs[name];
        const keySeq = line[0];
        km = top;
        mod = 0;
        this.descMap[name] = [keySeq, line[1]];
        let i = 0;
        for(; i < keySeq.length - 1; ++i) {
          const code = keySeq[i];
          const modk = MODIFIERS[code];

          if (modk) {
            mod = mod | modk;
            continue;
          }
          procMod();
          km = km[code] || (km[code] = {});
          if (Array.isArray(km))
            throw new Error(`Not a key map for: '${keySeq.slice(0,i + 1)}' => ${km}`);
        }
        procMod();

        km[keySeq[i]] = [name, line[1]];
      }
    }

    getTitle(desc, name) {
      const sc = this.descMap[name];
      if (! sc) return (this.descMap[name]=['', null, desc])[2];
      return sc[2] || (sc[2] = makeTitle(desc, sc[0]));
    }
  };

  function makeTitle(name, keySeq) {
    keySeq = keySeq.replace(/[\u0010-\u002B]/g, function (m) {
      const mc = MOD_NAMES[m];
      if (mc)
        return mc+'-';
      else
        return "<"+SYM_NAMES[m]+">";
    });
    return keySeq ? name + ' ['+keySeq+']' : name;
  }

  addModifiers(
    '\u0010shift',
    '\u0011ctrl',
    '\u0012alt'
  );

  function addModifiers(...args) {
    util.forEach(args, (code, i) => {
      const name = code.slice(1);
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

  function addCodes(...args) {
    util.forEach(args, (code, i) => {
      const name = code.slice(1);
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

    const keyMap = this;
    const code = String.fromCharCode(event.which);
    if (MODIFIERS[code]) return;

    let mod = eventMod(event);

    if (mod) {
      var map = keyMap.map[String.fromCharCode(mod)];
      if (! map) return;
    } else {
      map = keyMap.map;
    }

    map = map[String.fromCharCode(event.which)];
    if (! map) return;
    Dom.stopEvent(event);

    if (Array.isArray(map)) {
      map[1](event, map[0]);
    } else {
      window.addEventListener('keydown', nextKey, true);
      document.body.addEventListener('pointerleave', cancel, true);
    }

    function nextKey(event) {
      const code = String.fromCharCode(event.which);
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
        Dom.stopEvent(event);
        return;
      }
      cancel();
      if (! map) return;
      Dom.stopEvent(event);
      map[1](event, map[0]);
    }

    function cancel() {
      window.removeEventListener('keydown', nextKey, true);
      document.body.removeEventListener('pointerleave', cancel, true);
    }

  }

  function eventMod(event) {
    let mod = 0;
    if (event.shiftKey) mod = 1;
    if (event.ctrlKey) mod += 2;
    if (event.altKey) mod += 4;
    return mod;
  }
});
