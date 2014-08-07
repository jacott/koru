var path = require('path');
var fs = require('fs');

var rootDir = path.resolve(process.cwd(), '..');
var base = require('../app/koru/base-config');
var common = require(path.resolve(rootDir, 'config/common-config'));

var env = require(path.resolve(rootDir, 'config/', (process.argv[2] || 'demo')+'-config'));

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

module.exports = {
  rootDir: rootDir,
  server: config('server'),
  client: config('client'),
  extend: extend,
  merge: cfg.merge,
  set: cfg.set,

  setTarget: function (value) {return target = value || {};},
};

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
