define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const JsParser        = require('koru/parse/js-parser');
  const Core            = require('koru/test/core');
  const util            = require('koru/util');

  let interceptObj, interceptPrefix = '';

  const Intercept = require('koru/env!./intercept')(class {
    static finishIntercept() {
      interceptPrefix = '';
      interceptObj = void 0;
    }
  });

  const InterceptThrow = {
    name: 'intercept',
    toString: () => 'intercept'
  };

  function intercept(prefix, locals) {
    if (interceptObj === void 0) {
      interceptObj = this;
      interceptPrefix = prefix;
      const map = new Map();
      if (locals !== void 0) recurse(locals, map);
      recurse(this, map);
      const cand = Array.from(map.values()).sort((a, b) => a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1);
      Intercept.sendCandidates(JSON.stringify(cand));
    }
    Core.abortMode = 'end';
    throw InterceptThrow;
  };

  koru.__INTERCEPT$__ = Symbol();
  Object.prototype[koru.__INTERCEPT$__] = intercept;

  const recurse = (obj, ans = new Map()) => {
    if (obj == null) return ans;
    for (const name of Object.getOwnPropertyNames(obj)) {
      if (interceptPrefix === name.slice(0, interceptPrefix.length) &&
          ! ans.has(name) && name !== 'constructor' && name.slice(0,2) !== '__' && isNaN(+name)) {
        const desc = Object.getOwnPropertyDescriptor(obj, name);
        let type = desc.get !== void 0 ? 'G' : typeof desc.value === 'function' ? 'F' : 'P';
        let sample = '';
        let v = null;

        try {
          v = obj[name];
          if (typeof v !== 'object' && v !== void 0) sample = v.toString();

        } catch(err) {
        }

        const vtype = typeof v;
        if (vtype === 'function') {
          try {
            sample = JsParser.extractCallSignature(sample);
          } catch (err) {
          }
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
    recurse(Object.getPrototypeOf(obj), ans);
    return ans;
  };

  if (Core.onEnd !== void 0) {
    Core.onEnd(Intercept.finishIntercept);
  }

  return Intercept;
});