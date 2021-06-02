define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const JsParser        = require('koru/parse/js-parser');
  const Core            = require('koru/test/core');
  const util            = require('koru/util');

  let interceptPrefix = '';

  const setSource = (info, fn) => {
    const source =  fn.toString();

    if (/\[native code\]\s*\}$/.test(source)) {
      info.propertyType = 'native '+info.propertyType;
    } else {
      info.source = source;
    }
  };


  const Intercept = require('koru/env!./intercept')(class {
    static finishIntercept() {
      interceptPrefix = '';
    }

    static objectFunction(object) {
      if (object == null) return;
      if (typeof object === 'function') {
        return object;
      }
      return this.objectFunction(object.constructor);
    }

    static objectName(object) {
      const ans = this.objectFunction(object);
      if (ans === void 0) return '';
      if (ans === object) return ans.name;
      return ans.name+".prototype";
    }

    static objectSource(name) {
      if (Intercept.interceptObj === void 0) return null;

      const local = this.lookup(Intercept.locals, name);

      const ans = local ?? this.lookup(Intercept.interceptObj, name);

      if (ans === void 0) return null;

      const {object, propertyType, value} = ans;

      const info = {
        object: Intercept.objectName(object),
        name,
        propertyType,
        value: util.inspect(value),
        valueType: typeof value,
      };

      if (typeof value === 'function') {
        let strValue;
        try {
          const luValue = Intercept.locals?.[name] ?? Intercept.interceptObj[name];
          if (luValue !== value) {
            info.value = util.inspect(luValue);
            info.valueType = typeof luValue;
          } else {
            info.value = '';
          }
        } catch(err) {
          info.value = err.toString();
          info.valueType = 'error';
        }

        setSource(info, value);

        info.signature = JsParser.extractCallSignature(value, name);
      } else if (value !== null && typeof value === 'object' &&
                 typeof value.constructor === 'function' &&
                 value.constructor !== Object) {
        setSource(info, value.constructor);
      }

      return info;
    }

    static lookup(obj, name) {
      return recurseLoc(obj, name);
    }
  });

  const recurseLoc = (object, name) => {
    if (object == null) return;
    const desc = Object.getOwnPropertyDescriptor(object, name);
    if (desc === void 0) {
      return recurseLoc(Object.getPrototypeOf(object), name);
    }
    if (desc.get !== void 0) return {object, value: desc.get, propertyType: 'get'};
    if (desc.set !== void 0) return {object, value: desc.set, propertyType: 'set'};
    return {object, value: desc.value, propertyType: 'value'};
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
            sample = JsParser.extractCallSignature(v, name);
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
