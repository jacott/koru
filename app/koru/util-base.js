define((require, exports, module) => {
  'use strict';
  const {hasOwnProperty} = Object.prototype;
  const LABEL_RE = /^(?:[a-z_$][a-z_$0-9]*|[0-9]+)$/i;

  const qstr = (s) => /[\x00-\x09\x0b-\x1f\']/.test(s)
        ? JSON.stringify(s)
        : "'" + s.replace(/[\\\n]/g, (m) => m[0] === '\n' ? '\\n' : '\\\\') + "'";

  const qlabel = (id) => {
    if (LABEL_RE.test(id)) return id;
    return qstr(id);
  };

  if (String.prototype.at === void 0) {
    const value = function at(n) {
      // Convert the argument to an integer
      n = Math.trunc(n) || 0;
      // Allow negative indexing from the end
      if (n<0) n += this.length;
      // Out-of-bounds access returns undefined
      if (n<0 || n >= this.length) return undefined;
      // Otherwise, this is just normal property access
      return this[n];
    }

    for (let C of [Array, String, Uint8Array]) {
      if (C.prototype.at === void 0) {
        Object.defineProperty(C.prototype, 'at',
                              {value,
                               writable: true,
                               enumerable: false,
                               configurable: true});
      }
    }
  }

  const {inspect$}      = require('koru/symbols');

  const inspect1 = (o, i) => {
    try {
      switch (typeof o) {
      case 'undefined':
        return 'undefined';
      case 'function': {
        const name = o.name || '';
        return `function ${name !== qlabel(name) ? '' : name}(){}`;
      }case 'object': {
        if (o === null) return 'null';
        if (o[inspect$] !== undefined) return o[inspect$]();

        const {constructor} = o;

        if (constructor === Date) return 'Date("' + o.toISOString() + '")';
        if (constructor === RegExp) return o.toString();
        if ('outerHTML' in o) return 'Node`' + o.outerHTML + '`';
        if (o.nodeType === 3) return 'TextNode("' + o.textContent + '")';
        if (o.nodeType === 11) return 'DocumentFragment(`' + inspect1(o.firstChild, i-1) + '`)';
        if (Array.isArray(o)) {
          if (i) {
            return '[' + o.map((o2) => inspect1(o2, i-1)).join(', ') + ']';
          }
          return '[...more]';
        }
        if (typeof o.test === 'function' && typeof o.or === 'function') {
          return '' + o;
        }

        if (i != 0) {
          const r = [];
          if (o instanceof Error) {
            r.push('Error(`' + o.toString() + '`)');
          }
          for (const p in o) {
            if (r.length > Math.max(i, 10)) {
              r.push('...more');
              break;
            }
            const v = o[p];

            if (typeof v === 'function' && v.name === p && qlabel(p) === p) {
              r.push(p + '(){}');
            } else {
              r.push(qlabel(p) + ': ' + inspect1(v, i-1));
            }
          }
          const isSimple = constructor === undefined || constructor === Object;
          return (isSimple ? '{' : constructor.name + '({') + r.join(', ') +
            (isSimple ? '}' : '})');
        }
        for (let key in o) {
          return (`{...more}`);
        }
        return '{}';
      }case 'string':
        return qstr(o);
      case 'symbol':
        return "Symbol('" + o.description + "')";
      default:
        return o.toString();
      }
    } catch (ex) {
      return '(unknown)';
    }
  };

  const regexEscape = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  const idLen = 17;
  const idBytes = ((2*idLen - 1) >> 2) << 2;
  const abId = new ArrayBuffer(idBytes);
  const u32Id = new Uint32Array(abId);
  const u8Id = new Uint8Array(abId);
  const CHARS = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const util = {
    hasOwn: (obj, prop) => hasOwnProperty.call(obj, prop),
    idLen,
    u32Id, u8Id,
    CHARS,
    id: () => {
      let result = '';
      for (let i = 0; i<idLen; ++i) {
        result += CHARS[u8Id[i] % 62];
      }

      return result.slice(0, idLen);
    },
    idToUint8Array: (str, u8Id) => {
      for (let i = 0; i < str.length; ++i) {
        const o = str.charCodeAt(i);
        if (o<65) {
          u8Id[i] = o === 48 ? 9 : o-49;
        } else if (o<97) {
          u8Id[i] = o-29;
        } else {
          u8Id[i] = o-87;
        }
      }

      return u8Id;
    },

    browserVersion(ua) {
      const isMobile = /\bMobi(le)?\b/.test(ua);
      const m = ua.match(/(opr|opera|chrome|safari|iphone.*applewebkit|firefox|msie|edge|trident(?=\/))\/?\s*([\d\.]+)/i) || [];
      if (/trident/i.test(m[1])) {
        const tmp = /\brv[ :]+(\d+(\.\d+)?)/g.exec(ua) || [];
        return 'IE ' + (tmp[1] || '');
      }
      m[1] = m[1] ? m[1].replace(/\s.*/, '') : 'Unknown';
      const tmp = ua.match(/version\/([\.\d]+)/i);
      if (tmp != null) m[2] = tmp[1];
      return (isMobile ? 'Mobile ' : '') + m.slice(1).join('-');
    },

    merge(dest, source) {
      for (const prop in source) {
        const desc = Object.getOwnPropertyDescriptor(source, prop);
        desc === undefined || Object.defineProperty(dest, prop, desc);
      }
      return dest;
    },

    mergeNoEnum(dest, source) {
      for (const prop in source) {
        const desc = Object.getOwnPropertyDescriptor(source, prop);
        if (desc !== undefined) {
          desc.enumerable = false;
          Object.defineProperty(dest, prop, desc);
        }
      }
      return dest;
    },

    last: (ary) => ary[ary.length - 1],

    regexEscape,

    newEscRegex: (s) => new RegExp(regexEscape(s)),

    inspect: (o, count=4, len=1000) => inspect1(o, count).toString().slice(0, len),

    moduleName: (module) => module && util.capitalize(util.camelize(
      module.id.replace(/^.*\//, '').replace(/-(?:server|client)$/, ''))),

    qstr, qlabel,
  };

  return util;
});
