define(function(require, exports, module) {
  var util = require('koru/util');
  var geddon = require('./core');
  var format = require('../format');
  var match = require('./match');

  var gu = geddon._u;
  gu.format = format;

  var toString = Object.prototype.toString;

  var __elidePoint;

  var assert = geddon.assert = function (truth, msg) {
    ++geddon.assertCount;
    var __msg = geddon.__msg;
    __elidePoint = geddon.__elidePoint;
    geddon.__msg = null;
    geddon.__elidePoint = null;

    if (truth) return truth;

    msg = msg || 'Expected truthness';
    if (__msg) {
      if (typeof __msg === 'function') __msg = __msg();
      msg = `${__msg}; ${msg}`;
    }
    geddon.fail(msg);
  };

  var refute = geddon.refute = function (truth, msg) {
    geddon.assert(!truth, msg || 'Did not expect ' + util.inspect(truth));
  };

  assert.msg = function (msg) {
    geddon.__msg = msg;
    return this;
  };

  Object.defineProperty(assert, 'elideFromStack', {get: getElideFromStack});
  Object.defineProperty(refute, 'elideFromStack', {get: getElideFromStack});

  refute.msg = assert.msg;

  geddon.assertions = {
    add: function (name, options) {
      compileOptions(options);
      assert[name] = assertFunc(true, options);
      refute[name] = assertFunc(false, options);
    },
  };

  geddon.fail = function (message) {
    message = message ? message.toString() : 'no message';
    if (__elidePoint && __elidePoint.stack) {
      ex = __elidePoint;
      ex.message = message;
      var lines = __elidePoint.stack.split(/\n\s+at\s/);
      if (lines.length > 2) {
        lines = lines.slice(2);
        lines[0] = message;

        ex.stack = lines.join("\n    at ");
      } else {
        ex.stack = __elidePoint.stack.split("\n").slice(2).join("\n");
      }
    } else {
      var ex = new Error(message);
    }
    ex.name = "AssertionError";

    throw ex;
  };

  function getElideFromStack() {
    geddon.__elidePoint = geddon.__elidePoint || new Error('');
    return this;
  }

  function compileOptions(options) {
    if (! options.assertMessage)
      options.assertMessage = 'Expected ' + (options.message || 'success');

    if (! options.refuteMessage)
      options.refuteMessage = 'Did not Expect ' + (options.message || 'success');

    options.assertMessage = format.compile(options.assertMessage);
    options.refuteMessage = format.compile(options.refuteMessage);
    return options;
  }

  function assertFunc(pass, options) {
    var func = options.assert;
    return function(...args) {
      var sideAffects = {_asserting: pass};

      if (pass === ! func.apply(sideAffects, args)) {
        args.push(sideAffects);
        geddon.assert(false, format.apply(null, util.append([pass ? options.assertMessage : options.refuteMessage], args)));
      }
      geddon.assert(true);
      return pass ? assert : refute;
    };
  }

  gu.isDate = isDate;
  gu.egal = Object.is || egal;
  gu.deepEqual = deepEqual;

  function isDate(value) {
    // Duck typed dates, allows objects to take on the role of dates
    // without actually being dates
    return typeof value.getTime == "function" &&
      value.getTime() == value.valueOf();
  }


  // Fixes NaN === NaN (should be true) and
  // -0 === +0 (should be false)
  // http://wiki.ecmascript.org/doku.php?id=harmony:egal
  function egal(x, y) {
    if (x === y) {
      // 0 === -0, but they are not identical
      return x !== 0 || 1 / x === 1 / y;
    }

    // NaN !== NaN, but they are identical.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    return x !== x && y !== y;
  }

  function deepEqual(actual, expected, hint, hintField) {
    if (egal(actual, expected)) {
      return true;
    }

    if (match.match.$test(expected) && expected.$test(actual))
      return true;

    if (typeof actual !== 'object' || typeof expected !== 'object')
      return ((actual === undefined || expected === undefined) && actual == expected) || setHint();

    if (actual == null || expected == null) return setHint();

    if (actual.getTime && expected.getTime)
      return actual.getTime() === expected.getTime() || setHint();

    if (Array.isArray(actual)) {
      if (! Array.isArray(expected))
        return setHint();
      var len = actual.length;
      if (expected.length !== len)
        return hint ? setHint(actual, expected, 'lengths differ: ' + actual.length + ' != ' + expected.length) : false;
      for(var i = 0; i < len; ++i) {
        if (! deepEqual(actual[i], expected[i], hint, hintField)) return setHint();
      }
      return true;
    }

    var akeys = Object.keys(actual);
    var ekeys = Object.keys(expected);
    if (ekeys.length !== akeys.length)
      return hint ? setHint(actual, expected, 'lengths differ: ' + akeys.length + ' != ' + ekeys.length) : false;

    for (let i = 0; i < ekeys.length; ++i) {
      const key = ekeys[i];
      if (! deepEqual(actual[key], expected[key]))
        return badKey(key);
    }
    for (let i = 0; i < akeys.length; ++i) {
      const key = akeys[i];
      if (! expected.hasOwnProperty(key))
        return badKey(key);
    }
    return true;

    function badKey(key) {
      if (hint) {
        hint[hintField] = `at key = ${util.qstr(key)}${hint[hintField]||''}`;
        setHint();
      }
      return false;
    }

    function setHint(aobj, eobj, prefix) {
      if (! hint) return false;
      var prev = hint[hintField];

      aobj = aobj || actual; eobj = eobj || expected;
      hint[hintField] = (prefix || '') + format("\n    {i0}\n != {i1}", aobj, eobj) + (prev ? "\n" + prev : '');
      return false;
    }
  }
});
