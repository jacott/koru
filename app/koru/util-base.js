define((require, exports, module) => {
  'use strict';

  const {inspect$}      = require('koru/symbols');

  const {hasOwnProperty} = Object.prototype;

  Object.defineProperty(globalThis, 'assert', {
    value: (truthy, msg = 'assertion failed') => {
      if (!truthy) throw new Error(msg.toString());
    },
    writeable: false,
    configurable: true,
    enumerable: false,
  });

  const isPromise = (object) => typeof object?.then === 'function';

  const ifPromise = (object, trueCallback, falseCallbase = trueCallback) =>
    isPromise(object) ? object.then(trueCallback) : falseCallbase(object);

  Object.defineProperty(globalThis, 'isPromise', {
    value: isPromise,
    writeable: false,
    enumerable: false,
  });
  Object.defineProperty(globalThis, 'ifPromise', {
    value: ifPromise,
    writeable: false,
    enumerable: false,
  });

  const LABEL_RE = /^(?:[a-z_$][a-z_$0-9]*|[0-9]+)$/i;

  const qstr = (s) =>
    /[\x00-\x09\x0b-\x1f\']/.test(s)
      ? JSON.stringify(s)
      : "'" + s.replace(/[\\\n]/g, (m) => m[0] === '\n' ? '\\n' : '\\\\') + "'";

  const qlabel = (id) => {
    if (LABEL_RE.test(id)) return id;
    return qstr(id);
  };

  const inspect1 = (o, i) => {
    try {
      switch (typeof o) {
        case 'undefined':
          return 'undefined';
        case 'function': {
          const name = o.name ?? '';
          return `function ${name !== qlabel(name) ? '' : name}(){}`;
        }
        case 'object': {
          if (o === null) return 'null';
          if (o[inspect$] !== undefined) return o[inspect$]();

          const {constructor} = o;

          if (constructor === Date) return 'Date("' + o.toISOString() + '")';
          if (constructor === RegExp) return o.toString();
          if ('outerHTML' in o) return 'Node`' + o.outerHTML + '`';
          if (o.nodeType === 3) return 'TextNode("' + o.textContent + '")';
          if (o.nodeType === 11) return 'DocumentFragment(`' + inspect1(o.firstChild, i - 1) + '`)';
          if (Array.isArray(o)) {
            if (i) {
              return '[' + o.map((o2) => inspect1(o2, i - 1)).join(', ') + ']';
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
              if (r.length > Math.max(i, 50)) {
                r.push('...more');
                break;
              }
              const v = o[p];

              if (typeof v === 'function' && v.name === p && qlabel(p) === p) {
                r.push(p + '(){}');
              } else {
                r.push(qlabel(p) + ': ' + inspect1(v, i - 1));
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
        }
        case 'string':
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

  const strCode = (str, i) => {
    if (str.length == i) return 63;
    const o = str.charCodeAt(i);
    if (o < 65) {
      return o === 48 ? 9 : o - 49;
    }
    if (o < 97) {
      return o - 29;
    }
    return o - 87;
  };

  const util = {
    prog1: (arg) => arg,
    progn: (...args) => args[args.length - 1],
    hasOwn: (obj, prop) => hasOwnProperty.call(obj, prop),
    idLen,

    versionFromUserAgent(ua) {
      let name = 'Unknown';
      let version = name;

      if (typeof ua === 'string') {
        if (/firefox|fxios/i.test(ua)) {
          name = 'Firefox';
          version = ua.match(/(?:firefox|fxios)\/([\d.]+)/i)?.[1] ?? version;
        } else if (/safari/i.test(ua) && !/chrome|crios|crmo|edge|edg/i.test(ua)) {
          name = 'Safari';
          version = ua.match(/version\/([\d.]+)/i)?.[1] ?? version;
        } else if (/opr|opera/i.test(ua)) {
          name = 'Opera';
          version = ua.match(/(?:opr|opera)\/([\d.]+)/i)?.[1] ?? version;
        } else if (/edg/i.test(ua)) {
          name = 'Edge';
          version = ua.match(/edg\/([\d.]+)/i)?.[1] ?? version;
        } else if (/chrome|crios|crmo/i.test(ua)) {
          name = 'Chrome';
          version = ua.match(/(?:chrome|crios|crmo)\/([\d.]+)/i)?.[1] ?? version;
        }
      }

      return `${name}-${version}`;
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

    inspect: (o, count = 4, len = 1000) => inspect1(o, count).toString().slice(0, len),

    moduleName: (module) =>
      module == null
        ? module
        : util.capitalize(
          util.camelize(module.id.replace(/^.*\//, '').replace(/-(?:server|client)$/, '')),
        ),

    qstr,
    qlabel,

    isPromise,
    ifPromise,
  };

  return util;
});
