(function () {
  function browserVersion(ua){
    var tmp;
    var M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*([\d\.]+)/i) || [];
    if(/trident/i.test(M[1])){
      tmp=  /\brv[ :]+(\d+(\.\d+)?)/g.exec(ua) || [];
      return 'IE '+(tmp[1] || '');
    }
    if((tmp= ua.match(/version\/([\.\d]+)/i))!= null) M[2]= tmp[1];
    return M.slice(1).join(' ');
  }

  var engine = typeof navigator === 'undefined' ? 'Server' : browserVersion(navigator.userAgent);

  if (engine === 'Server') {
    var top = global;
    top.isServer = true;
    top.isClient = false;
  } else {
    var top = window;
    top.isServer = false;
    top.isClient = true;
  }

  define({
    engine: engine,
    browserVersion: browserVersion,

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

    regexEscape: function (s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    },

    newEscRegex: function (s) {
      return new RegExp(this.regexEscape(s));
    },

    inspect: function (o, count) {
      return inspect1(o, count || 4).toString().slice(0, 1000);
    },
  });

  function inspect1(o, i) {
    switch(typeof o) {
    case 'undefined':
      return 'undefined';
    case 'function':
      return 'function ' + o.name;
    case 'object':
      if (o === null) return 'null';
      if (o.hasOwnProperty('outerHTML'))
        return o.outerHTML;
      if (Array.isArray(o)) {
        if (i)
          return "[" + o.map(function (o2) {
            return inspect1(o2, i-1);
          }).join(", ") + "]";
        return "[...]";
      }

      if (i) {
        var r=[];
        if (o instanceof Error) {
          r.push(o.toString());
        }
        for (var p in o){
          r.push(p.toString() + ": " + inspect1(o[p], i-1));
        }
        return "{" + r.join(", ") +"}";
      }
      return ("{...}");
    case 'String':
      return '"'+o+'"';
    default:
      return o.toString();
    }
  }
})();
