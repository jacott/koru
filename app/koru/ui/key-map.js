define(function(require, exports, module) {
  const Dom             = require('../dom');
  const util            = require('../util');

  const MODIFIERS = {};
  const MOD_NAMES = {};
  const SYM_NAMES = {};

  exports = module.exports = (funcs, options) =>{
    const keyMap = new KeyMap();
    keyMap.exec = exec.bind(keyMap);

    keyMap.addKeys(funcs, options);

    return keyMap;
  };

  class KeyMap {
    constructor() {
      this.map = {};
      this.descMap = {};
    }

    addKeys(funcs, {mapCtrlToMeta}={}) {
      const top = this.map;
      let mod, km;

      const procMod = ()=>{
        if (mod != 0) {
          mod = String.fromCharCode(mod);
          km = km[mod] || (km[mod] = {});
          mod = 0;
        }
      };

      for(const name in funcs) {
        const line = funcs[name];
        const lastIdx = line.length -1;
        const func = line[lastIdx];
        this.descMap[name] = [line[0], func];
        for(let j = 0; j < lastIdx; ++j) {
          let keySeq = line[j];
          for(let k = 0; k < mapCtrlToMeta ? 2 : 1; ++k) {
            km = top;
            mod = 0;
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

            km[keySeq[i]] = [name, func];
            if (k == 0 && mapCtrlToMeta && ! /\u005B/.test(keySeq)) {
              const seq2 = keySeq.replace(/\u0011/g,  '\u005B');
              if (seq2 !== keySeq) {
                keySeq = seq2;
                continue;
              }
            }
            break;
          }
        }
      }
    }

    getTitle(desc, name) {
      const sc = this.descMap[name];
      if (! sc) return (this.descMap[name]=['', null, desc])[2];
      return sc[2] || (sc[2] = makeTitle(desc, sc[0]));
    }
  };

  function makeTitle(name, keySeq) {
    keySeq = keySeq.replace(/[\u0010-\u002B,\u0080-\u00DE]/g, function (m) {
      const mc = MOD_NAMES[m];
      if (mc)
        return mc+'-';
      else {
        const name = SYM_NAMES[m];
        return name.length == 1 ? name : "<"+name+">";
      }
    });
    return keySeq ? name + ' ['+keySeq+']' : name;
  }

  addModifiers(
    '\u0010shift',
    '\u0011ctrl',
    '\u0012alt',
    '\u005Bmeta',
  );

  function addModifiers(...args) {
    args.forEach((code, i) => {
      const name = code.slice(1);
      exports[name] = code = code[0];
      MODIFIERS[code] = 1 << i;
      SYM_NAMES[code] = name;
      MOD_NAMES[code] = name;
    });
  }

  {
    const addCodes = (...args)=>{
      util.forEach(args, (code, i) => {
        const name = code.slice(1);
        exports[name] = code = code[0];
        SYM_NAMES[code] = name;
      });
    };
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
      '\u002Edel',
      'Û[',
      'Ý]',
      'Ü\\',
      '\u00c0`',
    );
  }


  exports.modCodeToName = code => MOD_NAMES[code];

  const eventMod = event=>{
    let mod = 0;
    if (event.shiftKey) mod = 1;
    if (event.ctrlKey) mod += 2;
    if (event.altKey) mod += 4;
    if (event.metaKey) mod += 8;

    return mod;
  };

  function exec(event, ignoreFocus) {
    if (ignoreFocus !== 'ignoreFocus' && Dom.matches(document.activeElement, Dom.INPUT_SELECTOR))
      return;

    const keyMap = this;
    const code = String.fromCharCode(event.which);
    if (MODIFIERS[code]) return;

    let map, mod = eventMod(event);

    if (mod != 0) {
      map = keyMap.map[String.fromCharCode(mod)];
      if (map === undefined) return;
    } else {
      map = keyMap.map;
    }

    map = map[String.fromCharCode(event.which)];
    if (! map) return;
    Dom.stopEvent(event);

    if (Array.isArray(map)) {
      map[1](event, map[0]);
    } else {
      const cancel = ()=>{
        window.removeEventListener('keydown', nextKey, true);
        document.body.removeEventListener('pointerleave', cancel, true);
      };
      const nextKey = event =>{
        const code = String.fromCharCode(event.which);
        if (MODIFIERS[code] !== undefined) return;

        mod = eventMod(event);

        if (mod != 0) {
          map = map[String.fromCharCode(mod)];
          if (map === undefined) {
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
        if (map === undefined) return;
        Dom.stopEvent(event);
        map[1](event, map[0]);
      };
      window.addEventListener('keydown', nextKey, true);
      document.body.addEventListener('pointerleave', cancel, true);
    }
  }
});
