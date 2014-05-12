define(['./core'], function (geddon) {
  format.compile = compile;
  format.escape = escape;
  return geddon._u.format = format;

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
        var arg = last[spec.substring(2)];
      }
      switch (spec.substring(0,1)) {
      case 'e':
        result += escape(arg||'');
        break;
      case 'i':
        try {result += geddon.inspect(arg);}
        catch(ex) {result += arg;}
        break;
      default:
        result += arg;
      }
    }

    return result;
  }

  function compile(fmt) {
    var parts = fmt.split('{'),
        len = parts.length,
        result = [parts[0]],
        reg = /^([ei])?([0-9]+|\$\w+)}([\s\S]*)$/;

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
});
