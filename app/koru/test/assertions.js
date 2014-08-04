define(['./core', '../format'], function (geddon, format) {
  var gu = geddon._u;
  gu.format = format;

  var toString = Object.prototype.toString;

  var assert = geddon.assert = function (truth, msg) {
    ++geddon.assertCount;
    var __msg = geddon.__msg;
    geddon.__msg = null;

    if (truth) return truth;

    msg = msg || 'Expected truthness';
    if (__msg) {
      if (typeof __msg === 'function') __msg = __msg();
      msg = format("{i0} {1}", __msg, msg);
    }
    geddon.fail(msg);
  };

  var refute = geddon.refute = function (truth, msg) {
    geddon.assert(!truth, msg || 'Did not expect truthness');
  };

  assert.msg = function (msg) {
    geddon.__msg = msg;
    return this;
  };

  refute.msg = assert.msg;

  geddon.assertions = {
    add: function (name, options) {
      compileOptions(options);
      assert[name] = assertFunc(true, options);
      refute[name] = assertFunc(false, options);
    },
  };

  geddon.fail = function (message) {
    var ex = new Error(message && message.toString() || 'no message');
    ex.name = "AssertionError";
    throw ex;
  };

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
    return function() {
      var sideAffects = {_asserting: pass},
          args = arguments;

      if (pass === ! func.apply(sideAffects, args)) {
        args.push || (args = Array.prototype.slice.call(args, 0));
        args.push(sideAffects);
        geddon.assert(false, format.apply(null, [pass ? options.assertMessage : options.refuteMessage].concat(args)));
      }
      geddon.assert(true);
      return pass ? assert : refute;
    };
  }

  gu.isDate = isDate;
  gu.egal = egal;
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
    if (egal(expected, actual)) {
      return true;
    }

    // Elements are only equal if expected === actual
    if (gu.isElement(expected) || gu.isElement(actual)) {
      setHint();
      return false;
    }

    // null and undefined only pass for null === null and
    // undefined === undefined
    /*jsl: ignore*/
    if (expected == null || actual == null) {
      if (actual === expected) return true;
      setHint();
      return false;
    }
    /*jsl: end*/

    if (isDate(expected) || isDate(actual)) {
      if (isDate(expected) && isDate(actual) &&
        expected.getTime() == actual.getTime())
        return true;

      setHint();
      return false;
    }

    var useCoercingEquality = typeof expected != "object" || typeof actual != "object";

    if (expected instanceof RegExp && actual instanceof RegExp) {
      if (expected.toString() != actual.toString()) {
        setHint();
        return false;
      }

      useCoercingEquality = false;
    }

    // Arrays can only be equal to arrays
    var expectedStr = toString.call(expected);
    var actualStr = toString.call(actual);

    // Coerce and compare when primitives are involved
    if (useCoercingEquality) {
      if (expectedStr != "[object Array]" && actualStr != "[object Array]" &&
        expected == actual) return true;

      setHint();
      return false;
    }

    var expectedKeys = Object.keys(expected);
    var actualKeys = Object.keys(actual);

    if (isArguments(expected) || isArguments(actual)) {
      if (expected.length != actual.length) {
        setHint();
        return false;
      }
    } else {
      if (typeof expected != typeof actual || expectedStr != actualStr) {
        setHint();
        return false;
      }
      if (expectedKeys.length != actualKeys.length) {
        setHint(actualKeys, expectedKeys);
        return false;
      }
    }

    var key;

    for (var i = 0, l = expectedKeys.length; i < l; i++) {
      key = expectedKeys[i];
      if (! Object.prototype.hasOwnProperty.call(actual, key)) {
        setHint(actual[key], expected[key], 'key = ' + key + ': ');
        return false;
      }
      if (! deepEqual(actual[key], expected[key], hint, hintField)) {
        setHint(actual[key], expected[key], 'key = ' + key + ': ');
        return false;
      }
    }

    return true;

    function setHint(aobj, eobj, prefix) {
      if (! hint) return;
      var prev = hint[hintField];

      aobj = aobj || actual; eobj = eobj || expected;

      hint[hintField] = (prefix || '') + format("{i0} != {i1}", aobj, eobj) + (prev ? "\n    " + prev : '');
    }
  }

  function isArguments(obj) {
    if (typeof obj != "object" || typeof obj.length != "number" ||
        toString.call(obj) == "[object Array]") {
      return false;
    }

    if (typeof obj.callee == "function") {
      return true;
    }

    try {
      obj[obj.length] = 6;
      delete obj[obj.length];
    } catch (e) {
      return true;
    }

    return false;
  }
});
