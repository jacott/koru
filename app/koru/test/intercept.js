define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const JsParser        = require('koru/parse/js-parser');
  const Core            = require('koru/test/core');
  const util            = require('koru/util');

  let interceptPrefix = '';

  const Intercept = require('koru/env!./intercept')(class {
    static finishIntercept() {
      interceptPrefix = '';
    }

    static objectSource(name) {
      if (Intercept.interceptObj === void 0)
        return void 0;

      let source = recurseLoc(Intercept.locals, name) ?? recurseLoc(Intercept.interceptObj, name);

      let value;
      try {
        value = util.inspect(Intercept.locals?.[name] ?? Intercept.interceptObj[name]);
      } catch(err) {
        value = err.toString();
      }
      return JSON.stringify([value, source]);
    }
  });

  const recurseLoc = (obj, name) => {
    if (obj == null) return;
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, name);
      if (desc === void 0) {
        return recurseLoc(Object.getPrototypeOf(obj), name);
      }
      if (desc.get !== void 0) return desc.get.toString();
      if (desc.set !== void 0) return desc.set.toString();
      const {value} = desc;
      if (value == null) return null;
      switch(typeof value) {
      case 'function': return value.toString();
      case 'object': {
        const {constructor} = value;
        if (typeof constructor === 'function')
          return constructor.toString();
        return null;
      }
      default: return null;
      }
    } catch(err) {
      return err.toString();
    }
  };

  const InterceptThrow = {
    name: 'intercept',
    toString: () => 'intercept'
  };

  function intercept(prefix, locals) {
    Core.abortMode = 'end';
    if (InterceptThrow.interceptObj === void 0) {
      Intercept.interceptObj = this;
      Intercept.locals = locals;
      interceptPrefix = prefix;
      const map = new Map();
      if (locals !== void 0) recurse(locals, locals, map);
      recurse(this, this, map);
      const cand = Array.from(map.values()).sort((a, b) => a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1);
      Intercept.sendResult('C'+JSON.stringify(cand));
    }
    throw InterceptThrow;
  };

  koru.__INTERCEPT$__ = Symbol();
  Object.prototype[koru.__INTERCEPT$__] = intercept;

  const recurse = (orig, obj, ans = new Map()) => {
    if (obj == null) return ans;
    for (const name of Object.getOwnPropertyNames(obj)) {
      if (interceptPrefix === name.slice(0, interceptPrefix.length) &&
          ! ans.has(name) && name !== 'constructor' && name.slice(0,2) !== '__' && isNaN(+name)) {
        const desc = Object.getOwnPropertyDescriptor(obj, name);
        let type = desc.get !== void 0 ? 'G' : typeof desc.value === 'function' ? 'F' : 'P';
        let sample = '';
        let v = null;

        try {
          v = orig[name];
          if (typeof v !== 'object' && v !== void 0) sample = v.toString();

        } catch(err) {
          sample = err.toString();
        }

        if (typeof v === 'function') {
          let sig = '';
          try {
            sample = JsParser.extractCallSignature(sample);
          } catch (err) {}
          if (sample.startsWith('constructor')) {
            if (type === 'G')
              type += 'C';
            else
              type = 'C';
          } else if (sample[0] === '(') {
            sample = name+sample;
          }
          if (type === 'G')
            type += 'F';
        }

        ans.set(name, [name, type, sample.slice(0, 400)]);
      }
    }
    recurse(orig, Object.getPrototypeOf(obj), ans);
    return ans;
  };

  return Intercept;
});
