module.exports = function (envName, rootDir) {
  var path = require('path');
  var fs = require('fs');

  envName = envName || 'demo';
  rootDir = rootDir || path.resolve(process.cwd(), '..');
  var base = require('../app/koru/base-config');
  var common = require(path.resolve(rootDir, 'config/common-config'));

  var env = require(path.resolve(rootDir, 'config/', envName+'-config'));

  var target;
  var cfg = {
    merge: function (key, value) {
      var pair = lookupDottedKey(key, target);
      var orig = pair[0][pair[1]];
      if (! orig) {
        pair[0][pair[1]] = value;
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(function (v) {
          orig.push(v);
        });
      } else {
        extend(orig, value);
      }
    },

    set: function (key, value) {
      var pair = lookupDottedKey(key, target);
      pair[0][pair[1]] = value;
    },
  };

  function stringify(value) {
    if (value == null) return ''+value;
    switch (typeof value) {
    case 'object':
      if (Array.isArray(value)) {
        var result = [];
        for(var i = 0; i < value.length; ++i) {
          result.push(stringify(value[i]));
        }
        return "["+result.join(",")+"]";
      } else {
        var result = [];
        for (var key in value) {
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

  function extend(obj, properties) {
    for(var prop in properties) {
      Object.defineProperty(obj,prop,Object.getOwnPropertyDescriptor(properties,prop));
    }
    return obj;
  }

  function lookupDottedKey(key, attrs) {
    var parts = key.split('.');
    for(var i = 0; i + 1 < parts.length; ++i) {
      var row = parts[i];
      attrs = attrs[row] || (attrs[row] = {});
    }
    return [attrs, parts[i]];
  }

  function config(type) {
    target = {};
    [base, common, env].forEach(function (n) {
      n.common && n.common(cfg);
      n[type] && n[type](cfg);
    });
    return target;
  }

  return {
    rootDir: rootDir,
    envName: envName,
    server: config('server'),
    client: config('client'),
    extend: extend,
    merge: cfg.merge,
    set: cfg.set,

    stringify: stringify,

    setTarget: function (value) {return target = value || {};},
  };
};
