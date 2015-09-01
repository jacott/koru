(function () {
  define({
    browserVersion: function(ua){
      var tmp;
      var M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*([\d\.]+)/i) || [];
      if(/trident/i.test(M[1])){
        tmp=  /\brv[ :]+(\d+(\.\d+)?)/g.exec(ua) || [];
        return 'IE '+(tmp[1] || '');
      }
      if((tmp= ua.match(/version\/([\.\d]+)/i))!= null) M[2]= tmp[1];
      return M.slice(1).join(' ');
    },

    extend: function(obj, properties) {
      for(var prop in properties) {
        Object.defineProperty(obj,prop,Object.getOwnPropertyDescriptor(properties,prop));
      }
      return obj;
    },

    extendNoEnum: function (obj, properties) {
      for(var prop in properties) {
        var desc = Object.getOwnPropertyDescriptor(properties,prop);
        desc.enumerable = false;
        Object.defineProperty(obj,prop,desc);
      }
      return obj;
    },

    last: function (ary) {
      return ary[ary.length -1];
    },

    regexEscape: function (s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    },

    newEscRegex: function (s) {
      return new RegExp(this.regexEscape(s));
    },

    inspect: function (o, count, len) {
      return inspect1(o, count || 4).toString().slice(0, len || 1000);
    },

    qstr: qstr,
  });

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
})();
