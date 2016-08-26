define(function(require, exports, module) {
  module.exports = {
    browserVersion(ua){
      var tmp;
      var M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*([\d\.]+)/i) || [];
      if(/trident/i.test(M[1])){
        tmp=  /\brv[ :]+(\d+(\.\d+)?)/g.exec(ua) || [];
        return 'IE '+(tmp[1] || '');
      }
      if((tmp= ua.match(/version\/([\.\d]+)/i))!= null) M[2]= tmp[1];
      return M.slice(1).join(' ');
    },

    merge(dest, source) {
      for(var prop in source) {
        Object.defineProperty(dest, prop,Object.getOwnPropertyDescriptor(source, prop));
      }
      return dest;
    },

    mergeNoEnum(dest, source) {
      for(var prop in source) {
        var desc = Object.getOwnPropertyDescriptor(source, prop);
        desc.enumerable = false;
        Object.defineProperty(dest, prop, desc);
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

  function qstr(s) {
    return JSON.stringify(s).slice(1, -1);
  }

  function inspect1(o, i) {
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
            return "[" + o.map(function (o2) {
              return inspect1(o2, i-1);
            }).join(", ") + "]";
          return "[...]";
        }
        if (typeof o.test === 'function' && typeof o.or === 'function')
          return ''+o;

        if (i) {
          var r=[];
          if (o instanceof Error) {
            r.push(o.toString());
          }
          for (var p in o) {
            r.push(qstr(p) + ": " + inspect1(o[p], i-1));
          }
          return "{" + r.join(", ") +"}";
        }
        for(var key in o) {
          return ("{"+key+"="+o[key]+",...}");
        }
      case 'string':
        return "'"+qstr(o)+"'";
      default:
        return o.toString();
      }
    } catch(ex) {
      return '??';
    }
  }
});
