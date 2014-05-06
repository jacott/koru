define(['./core', './format'], function (geddon) {
  var gu = geddon._u;

  var toString = Object.prototype.toString;

  var assert = geddon.assert = function (truth, msg) {
    ++geddon.assertCount;
    var __msg = geddon.__msg;
    geddon.__msg = null;

    if (truth) return truth;

    msg = msg || 'Expected truthness';
    if (__msg) {
      if (typeof __msg === 'function') __msg = __msg();
      msg = __msg + ": " +msg;
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


    options.assertMessage = gu.format.compile(options.assertMessage);
    options.refuteMessage = gu.format.compile(options.refuteMessage);
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
        geddon.assert(false, gu.format.apply(gu, [pass ? options.assertMessage : options.refuteMessage].concat(args)));
      }
      geddon.assert(true);
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

  function deepEqual(expected, actual) {
    if (egal(expected, actual)) {
      return true;
    }

    // Elements are only equal if expected === actual
    if (gu.isElement(expected) || gu.isElement(actual)) {
      return false;
    }

    // null and undefined only pass for null === null and
    // undefined === undefined
    /*jsl: ignore*/
    if (expected == null || actual == null) {
      return actual === expected;
    }
    /*jsl: end*/

    if (isDate(expected) || isDate(actual)) {
      return isDate(expected) && isDate(actual) &&
        expected.getTime() == actual.getTime();
    }

    var useCoercingEquality = typeof expected != "object" || typeof actual != "object";

    if (expected instanceof RegExp && actual instanceof RegExp) {
      if (expected.toString() != actual.toString()) {
        return false;
      }

      useCoercingEquality = false;
    }

    // Arrays can only be equal to arrays
    var expectedStr = toString.call(expected);
    var actualStr = toString.call(actual);

    // Coerce and compare when primitives are involved
    if (useCoercingEquality) {
      return expectedStr != "[object Array]" && actualStr != "[object Array]" &&
        expected == actual;
    }

    var expectedKeys = Object.keys(expected);
    var actualKeys = Object.keys(actual);

    if (isArguments(expected) || isArguments(actual)) {
      if (expected.length != actual.length) {
        return false;
      }
    } else {
      if (typeof expected != typeof actual || expectedStr != actualStr ||
          expectedKeys.length != actualKeys.length) {
        return false;
      }
    }

    var key;

    for (var i = 0, l = expectedKeys.length; i < l; i++) {
      key = expectedKeys[i];
      if (!Object.prototype.hasOwnProperty.call(actual, key) ||
          !deepEqual(expected[key], actual[key])) {
        return false;
      }
    }

    return true;
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
