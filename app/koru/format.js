define(function(require, exports, module) {
  const util = require('./util');

  format.compile = compile;
  format.escape = escape;

  function format(fmt) {
    if (typeof fmt === 'string')
      fmt = compile(fmt);

    let i = 1, result ='';

    const len = fmt.length;
    let last = arguments[arguments.length -1],
        lit = fmt[0];

    if (last === fmt || ! last || typeof last !== 'object')
      last = this;

    for(let i =0, lit = fmt[0];
        i < len;
        lit = fmt[++i]) {

      result += lit;

      let spec = fmt[++i];
      if (spec === undefined) return result;


      let argIndex = spec && +spec.substring(1);


      if (argIndex != null && argIndex === argIndex) {
        var arg = arguments[argIndex+1];
      } else {
        var arg = nested(spec.substring(2), last, this);
      }
      switch (spec.substring(0,1)) {
      case 'e':
        if (arg != null)
          result += escape(arg);
        break;
      case 'i':
        try {result += util.inspect(arg);}
        catch(ex) {result += arg;}
        break;
      case 'f':
        result += precision(fmt[++i], arg);
        break;
      default:
        if (arg != null)
          result += arg;
      }
    }

    return result;
  }

  const zeros = '00000000000000000000';

  function precision(format, value) {
    if (! value && value !== 0) return '';
    const [padding, dpfmt] = format.split('.');

    const dpPad = dpfmt.slice(-1) !== 'z';
    const dpLen = +(dpPad ? dpfmt : dpfmt.slice(0, -1));

    const precision = Math.pow(10, +dpLen);
    const absVal = Math.abs(value);
    let sig = Math.floor(absVal);
    let dp = ''+Math.round((absVal - sig)*precision);

    if (dp.length > dpLen) {
      sig = Math.round(absVal);
      dp = dp.slice(1);
    }

    if (dpPad)
      return `${sig*Math.sign(value)}.${dp}${zeros.slice(0,dpLen-dp.length)}`;

    return `${sig*Math.sign(value)}.${dp}`.replace(/\.?0*$/, '');
  }

  function nested(key, values) {
    key = key.split('.');
    for(let i=0;values && i < key.length;++i) {
      values = values[key[i]];
    }

    return values;
  }

  function compile(fmt) {
    const parts = fmt.split('{'),
          len = parts.length,
          result = [parts[0]],
          reg = /^([eif])?([0-9]+|\$[\w.]+)(?:,([0-9]*\.[0-9]+z?))?}([\s\S]*)$/;

    for(let i = 1;i < len;++i) {
      let item = parts[i];
      let m = reg.exec(item);
      if (m) {
        result.push((m[1] || 's') + m[2]);
        if (m[3]) result.push(m[3]);
        result.push(m[4]);
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

  const escapes = {
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

  return format;
});
