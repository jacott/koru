define((require, exports, module)=>{
  const util            = require('koru/util');
  const match           = require('../match').__initBase__();
  const Core            = require('./core');

  util.merge(match, {
    near: (expected, delta)=>{
      delta = delta  || 1;
      return match(
        actual => actual > expected-delta && actual < expected+delta,
        "match.near(" + expected + ", delta=" + delta + ")");
    },

    field: (name, value)=>{
      return match(actual => actual && Core.util.deepEqual(actual[name], value),
                   "match.field(" + name + ", " + value + ")");
    },
  });

  return match;
});
