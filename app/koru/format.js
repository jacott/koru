define(function(require, exports, module) {
  format.compile = compile;
  format.escape = escape;

  function format(fmt) {
    if (typeof fmt === 'string')
      fmt = compile(fmt);

    var i = 1,
        result ='',
        len = fmt.length,
        last = arguments[arguments.length -1],
        lit =fmt[0];

    for(var i =0, lit = fmt[0];
        i < len;
        lit = fmt[++i]) {

      var spec = fmt[++i],
          argIndex = spec && +spec.substring(1);

      result += lit;

      if (spec === undefined) return result;

      if (argIndex != null && argIndex === argIndex) {
        var arg = arguments[argIndex+1];
      } else {
        var arg = nested(spec.substring(2), last);
      }
      if (arg != null) switch (spec.substring(0,1)) {
      case 'e':
        result += escape(arg);
        break;
      case 'i':
        try {result += inspect(arg).toString;}
        catch(ex) {result += arg;}
        break;
      default:
        result += arg;
      }
    }

    return result;
  }

  function nested(key, values) {
    key = key.split('.');
    for(var i=0;values && i < key.length;++i) {
      values = values[key[i]];
    }

    return values;
  }

  function compile(fmt) {
    var parts = fmt.split('{'),
        len = parts.length,
        result = [parts[0]],
        reg = /^([ei])?([0-9]+|\$[\w.]+)}([\s\S]*)$/;

    for(var i=1,item;i < len;++i) {
      item = parts[i];
      var m = reg.exec(item);
      if (m) {
        result.push((m[1] || 's') + m[2]);
        result.push(m[3]);
      } else if (item.substring(0,1) === '}') {
        result[result.length-1] = result[result.length-1] + '{' + item.substring(1);
      } else if (item) {
        result[result.length-1] = result[result.length-1] + item;
      }
    }

    return result;
  };


  function escape(str) {
    return str != null ? str.toString().replace(/[<>"'`&]/g, escaped) : '';
  }

  var escapes = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;",
    "&": "&amp;"
  };

  function escaped(chr) {
    return escapes[chr];
  };

  function inspect(o, i) {
    if (i <0 || o == null) return typeof o;
    switch(typeof o) {
    case 'function':
      return 'function ' + o.name;
    case 'object':
      if (Array.isArray(o))
        return "[" + o.map(function (o2) {
          return inspect(o2, i-1);
        }).join(", ") + "]";

      var r=[];
      for (var p in o){
        r.push(p.toString() + ": " + inspect(o[p], i-1));
      }
      return "{" + r.join(", ") +"}";
    default:
      return o.toString();
    }
  }
  return format;
});
