module.exports = function (envName, rootDir) {
  const path = require('path');
  const fs = require('fs');

  envName = envName || 'demo';
  rootDir = rootDir || path.resolve(process.cwd(), '..');
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
    merge: function (key, value) {
      const pair = lookupDottedKey(key, target);
      const orig = pair[0][pair[1]];
      if (! orig) {
        pair[0][pair[1]] = value;
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(function (v) {
          orig.push(v);
        });
      } else {
        merge(orig, value);
      }
    },

    set: function (key, value) {
      const pair = lookupDottedKey(key, target);
      pair[0][pair[1]] = value;
    },
  };

  function stringify(value) {
    if (value == null) return ''+value;
    switch (typeof value) {
    case 'object':
      if (Array.isArray(value)) {
        const result = [];
        for(let i = 0; i < value.length; ++i) {
          result.push(stringify(value[i]));
        }
        return "["+result.join(",")+"]";
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
  }

  let mergeCallCount = 0;

  function merge(obj, properties) {
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
  }

  function lookupDottedKey(key, attrs) {
    const parts = key.split('.');
    let i;
    for(i = 0; i + 1 < parts.length; ++i) {
      const row = parts[i];
      attrs = attrs[row] || (attrs[row] = {});
    }
    return [attrs, parts[i]];
  }

  function config(type) {
    target = {};
    [base, common, env].forEach(function (n) {
      if (n) {
        n.common && n.common(cfg);
        n[type] && n[type](cfg);
      }
    });
    return target;
  }

  return {
    rootDir: rootDir,
    envName: envName,
    server: config('server'),
    client: config('client'),
    merge: cfg.merge,
    set: cfg.set,

    stringify: stringify,

    setTarget: function (value) {return target = value || {};},
  };
};
