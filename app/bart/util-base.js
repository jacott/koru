/*global define navigator global require window */

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
    var Fiber = require('fibers');

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

    regexEscape: function (s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    },

    newEscRegex: function (s) {
      return new RegExp(this.regexEscape(s));
    },

    inspect: function (o) {
      return inspect1(o).toString();
    },
  });

  function inspect1(o, i) {
    if (i <0 || o == null) return typeof o;
    switch(typeof o) {
    case 'function':
      return 'function ' + o.name;
    case 'object':
      if (o instanceof Array)
        return "[" + o.map(function (o2) {
          return inspect1(o2, i-1);
        }).join(", ") + "]";

      var r=[];
      for (var p in o){
        r.push(p.toString() + ": " + inspect1(o[p], i-1));
      }
      return "{" + r.join(", ") +"}";
    case 'String':
      return '"'+o+'"';
    default:
      return o.toString();
    }
  }
})();
