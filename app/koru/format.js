define((require)=>{
  'use strict';
  const ResourceString  = require('koru/resource-string');
  const util            = require('./util');

  function format(fmt, ...args) {
    if (typeof fmt === 'string')
      fmt = compile(fmt);

    let i = 1, result ='';

    const len = fmt.length;
    let last = args[args.length -1],
        lit = fmt[0];

    if (last === fmt || ! last || typeof last !== 'object')
      last = this;

    for(let i =0, lit = fmt[0];
        i < len;
        lit = fmt[++i]) {

      result += lit;

      let spec = fmt[++i];
      if (spec === undefined) return result;


      let argIndex = spec ? +spec.substring(1) : -1;


      const arg = (argIndex != -1 && argIndex === argIndex) ? args[argIndex] :
              nested(spec.substring(2), last, this);
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
  };

  const zeros = '00000000000000000000';

  const precision = (format, value)=>{
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
  };

  const nested = (key, values)=>{
    key = key.split('.');
    for(let i=0; values && i < key.length;++i) {
      values = values[key[i]];
    }

    return values;
  };

  const compile = fmt =>{
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


  const escape = str => str != null ? str.toString().replace(/[<>"'`&]/g, escaped) : '';

  const escapes = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;",
    "&": "&amp;"
  };

  const escaped = chr => escapes[chr];

  const findString = (lang, text)=>{
    const lrs = ResourceString[lang];
    const ans = lrs && lrs[text];
    if (ans !== void 0) return ans;
    if (lang !== 'en') {
      const ans = ResourceString.en[text];
      if (ans !== void 0) return ans;
    }
    return text;
  };


  format.compile = compile;
  format.escape = escape;

  format.translate = (text, lang='en')=>{
    if (typeof text === 'string') {
      const idx = text.indexOf(':');
      if (idx != -1) {
        return format(findString(lang, text.slice(0, idx)), text.slice(idx+1).split(':'));
      }
      return findString(lang, text);
    }
    if (text.constructor === Array) {
      return format(findString(lang, text[0]), text.slice(1));
    }
    return text;
  };

  return format;
});
