const path = require('path');
module.exports = (envName='demo', rootDir=path.resolve(process.cwd(), '..'))=>{
  const fs = require('fs');

  const base = require('../app/koru/base-config');
  const common = require(path.resolve(rootDir, 'config/common-config'));

  let env;
  try {
    env = require(path.resolve(rootDir, 'config/', envName+'-config'));
  } catch(ex) {
    if (ex.code !== 'MODULE_NOT_FOUND')
      throw ex;
  }

  let target;
  const cfg = {
    merge(key, value) {
      const pair = lookupDottedKey(key, target);
      const orig = pair[0][pair[1]];
      if (! orig) {
        pair[0][pair[1]] = value;
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(v => {orig.push(v)});
      } else {
        merge(orig, value);
      }
    },

    set(key, value) {
      const pair = lookupDottedKey(key, target);
      pair[0][pair[1]] = value;
    },
  };

  const stringify = (value)=>{
    if (value == null) return 'null';
    switch (typeof value) {
    case 'object':
      if (Array.isArray(value)) {
        return "["+value.map(stringify).join(",")+"]";
      } else {
        const result = [];
        for (let key in value) {
          result.push(JSON.stringify(key)+':' + stringify(value[key]));
        }
        return "{"+result.join(",")+"}";
      }
    case 'function':
      return value.toString();
    default:
      return JSON.stringify(value);
    }
  };

  let mergeCallCount = 0;

  const merge = (obj, properties)=>{
    if (++mergeCallCount > 30)
      throw new Error("too much merging!!!");
    for(let prop in properties) {
      if (obj[prop] && typeof properties[prop] === 'object') {
        merge(obj[prop], properties[prop]);
      } else {
        Object.defineProperty(obj,prop,Object.getOwnPropertyDescriptor(properties, prop));
      }
    }
    --mergeCallCount;
    return obj;
  };

  const lookupDottedKey = (key, attrs)=>{
    const parts = key.split('.');
    let i;
    for(i = 0; i + 1 < parts.length; ++i) {
      const row = parts[i];
      attrs = attrs[row] || (attrs[row] = {});
    }
    return [attrs, parts[i]];
  };

  const config = (type)=>{
    target = {};
    [base, common, env].forEach(n => {
      if (n) {
        n.common && n.common(cfg);
        n[type] && n[type](cfg);
      }
    });
    return target;
  };

  return {
    rootDir,
    envName,
    server: config('server'),
    client: config('client'),
    merge: cfg.merge,
    set: cfg.set,

    stringify,

    setTarget(value) {return target = value || {};},
  };
};
