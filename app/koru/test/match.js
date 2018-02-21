define(function(require, exports, module) {
  const util   = require('koru/util');
  const match  = require('../match').__initBase__();
  const Core = require('./core');

  util.merge(match, {
    near (expected, delta) {
      delta = delta  || 1;
      return match(function matchNear(actual) {
        return actual > expected-delta && actual < expected+delta;
      }, "match.near(" + expected + ", delta=" + delta + ")");
    },

    field (name, value) {
      return match(function matchField(actual) {
        return actual && Core._u.deepEqual(actual[name], value);
      }, "match.field(" + name + ", " + value + ")");
    },
  });

  return match;
});
