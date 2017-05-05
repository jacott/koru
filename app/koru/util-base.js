define(function(require, exports, module) {
  const qstr = s => JSON.stringify(s).slice(1, -1);

  module.exports = {
    idLen: 17,
    browserVersion(ua) {
      const isMobile = /\bMobi(le)?\b/.test(ua);
      const m = ua.match(/(opr|opera|chrome|safari|iphone.*applewebkit|firefox|msie|edge|trident(?=\/))\/?\s*([\d\.]+)/i) || [];
      if(/trident/i.test(m[1])){
        const tmp = /\brv[ :]+(\d+(\.\d+)?)/g.exec(ua) || [];
        return 'IE '+(tmp[1] || '');
      }
      m[1] = m[1] ? m[1].replace(/\s.*/, '') : 'Unknown';
      const tmp = ua.match(/version\/([\.\d]+)/i);
      if(tmp != null) m[2]= tmp[1];
      return (isMobile ? 'Mobile ' : '') + m.slice(1).join(' ');
    },

    merge(dest, source) {
      for(const prop in source) {
        const desc = Object.getOwnPropertyDescriptor(source, prop);
        desc === undefined || Object.defineProperty(dest, prop, desc);
      }
      return dest;
    },

    mergeNoEnum(dest, source) {
      for(const prop in source) {
        const desc = Object.getOwnPropertyDescriptor(source, prop);
        if (desc !== undefined) {
          desc.enumerable = false;
          Object.defineProperty(dest, prop, desc);
        }
      }
      return dest;
    },

    last(ary) {
      return ary[ary.length -1];
    },

    regexEscape(s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    },

    newEscRegex(s) {
      return new RegExp(this.regexEscape(s));
    },

    inspect(o, count, len) {
      return inspect1(o, count || 4).toString().slice(0, len || 1000);
    },

    qstr,
  };
  /**
   * @deprecated extend - too confusing with class extends so use merge
   **/
  module.exports.extend = module.exports.merge;

  const inspect1 = (o, i) => {
    try {
      switch(typeof o) {
      case 'undefined':
        return 'undefined';
      case 'function':
        return '=> ' + o.name;
      case 'object':
        if (o === null) return 'null';
        if (o.constructor === RegExp) return o.toString();
        if ('outerHTML' in o)
          return o.outerHTML;
        if (o.nodeType === 3)
          return "$TextNode:"+o.textContent;
        if (o.$inspect)
          return o.$inspect();
        if (o.constructor === Date) return "<"+o.toISOString()+">";
        if (Array.isArray(o)) {
          if (i)
            return "[" + o.map(o2 => inspect1(o2, i-1)).join(", ") + "]";
          return "[...]";
        }
        if (typeof o.test === 'function' && typeof o.or === 'function')
          return ''+o;

        if (i) {
          const r=[];
          if (o instanceof Error) {
            r.push(o.toString());
          }
          for (const p in o) {
            r.push(qstr(p) + ": " + inspect1(o[p], i-1));
          }
          return "{" + r.join(", ") +"}";
        }
        for(let key in o) {
          return (`{${key}=${o[key]},...}`);
        }
      case 'string':
        return `'${qstr(o)}'`;
      default:
        return o.toString();
      }
    } catch(ex) {
      return '??';
    }
  };
});
