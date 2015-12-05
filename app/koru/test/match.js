define(function(require, exports, module) {
  var util = require('koru/util');
  var geddon = require('./core');

  var match = require('../match').__initBase__();

  util.extend(match, {
    near: function (expected, delta) {
      delta = delta  || 1;
      return match(function matchNear(actual) {
        return actual > expected-delta && actual < expected+delta;
      }, "match.near(" + expected + ", delta=" + delta + ")");
    },

    field: function (name, value) {
      return match(function matchField(actual) {
        return actual && geddon._u.deepEqual(actual[name], value);
      }, "match.field(" + name + ", " + value + ")");
    },
  });

  return match;
});
