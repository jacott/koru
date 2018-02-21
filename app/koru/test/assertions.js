define(function(require, exports, module) {
  const util   = require('koru/util');
  const format = require('../format');
  const Core = require('./core');
  const match  = require('./match');

  const {hasOwn} = util;

  const gu = Core._u;
  const {egal} = util;

  let __elidePoint;

  class AssertionError extends Error {
  }
  AssertionError.name = AssertionError.prototype.name = 'AssertionError';
  this.AssertionError = AssertionError;

  function assert(truth, msg) {
    ++Core.assertCount;
    let {__msg} = Core;
    __elidePoint = Core.__elidePoint;
    Core.__msg = null;
    Core.__elidePoint = null;

    if (truth) return truth;

    msg = msg || 'Expected truthness';
    if (__msg) {
      if (typeof __msg === 'function') __msg = __msg();
      msg = `${__msg}; ${msg}`;
    }
    fail(msg);
  };

  function refute (truth, msg) {
    Core.assert(!truth, msg || 'Did not expect ' + util.inspect(truth));
  };

  util.merge(Core, {
    assert, refute,
    fail(message) {assert(false, message);},

    assertions: {
      add(name, options) {
        compileOptions(options);
        assert[name] = assertFunc(true, options);
        refute[name] = assertFunc(false, options);
      },
    },
  });

  Object.defineProperty(assert, 'elideFromStack', {get: getElideFromStack});
  Object.defineProperty(refute, 'elideFromStack', {get: getElideFromStack});

  assert.msg = function(msg) {
    Core.__msg = msg;
    return this;
  };

  refute.msg = assert.msg;

  function fail(message) {
    message = message ? message.toString() : 'no message';
    let ex;
    if (__elidePoint && __elidePoint.stack) {
      ex = __elidePoint;
      ex.message = message;
      let lines = __elidePoint.stack.split(/\n\s+at\s/);
      if (lines.length > 2) {
        lines = lines.slice(2);
        lines[0] = message;

        ex.stack = lines.join("\n    at ");
      } else {
        ex.stack = __elidePoint.stack.split("\n").slice(2).join("\n");
      }
      throw ex;
    } else {
      throw new AssertionError(message);
    }
  };

  function getElideFromStack() {
    Core.__elidePoint = Core.__elidePoint || new AssertionError('');
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
    const func = options.assert;
    return function(...args) {
      const sideAffects = {_asserting: pass};

      if (pass === ! func.apply(sideAffects, args)) {
        args.push(sideAffects);
        Core.assert(false, format.apply(null, util.append([
          pass ? options.assertMessage : options.refuteMessage], args)));
      }
      Core.assert(true);
      return pass ? assert : refute;
    };
  }

  util.merge(gu, {
    format,
    egal: Object.is || egal,
    deepEqual,
  });

  function deepEqual(actual, expected, hint, hintField) {
    if (egal(actual, expected)) {
      return true;
    }

    if (match.match.$test(expected) && expected.$test(actual))
      return true;

    if (typeof actual !== 'object' || typeof expected !== 'object') {
      if ((actual === undefined || expected === undefined) && actual == expected)
        return true;
      if (hint) {
        if (typeof actual === 'string' && typeof expected === 'string') {
          const al = actual.length, el = expected.length;
          const len = Math.min(al, el);
          if (len > 20) {
            let s = 0;
            while(s < len && actual[s] === expected[s])
              ++s;
            let e = -1;
            while(e + len - s >= 0 && actual[e + al] === expected[e + el])
              --e;
            setHint(actual.slice(s, e+1 || undefined), expected.slice(s, e+1 || undefined),
                    'diff '+JSON.stringify(actual.slice(0, s)).slice(1, -1)
                    .replace(/./g, '-')+'^');
          }
        }
        setHint();
      }
      return false;
    }

    if (actual == null || expected == null) return setHint();

    if (actual.getTime && expected.getTime)
      return actual.getTime() === expected.getTime() || setHint();

    if (Array.isArray(actual)) {
      if (! Array.isArray(expected))
        return setHint();
      const len = actual.length;
      if (expected.length !== len)
        return hint ? setHint(actual, expected, ' lengths differ: ' + actual.length + ' != ' + expected.length) : false;
      for(let i = 0; i < len; ++i) {
        if (! deepEqual(actual[i], expected[i], hint, hintField)) return setHint();
      }
      return true;
    }

    if (Array.isArray(expected))
      return setHint(actual, expected);

    const akeys = Object.keys(actual);
    const ekeys = Object.keys(expected);
    if (ekeys.length !== akeys.length)
      return hint ?
      setHint(actual, expected, ' keys differ:\n    ' +
              util.inspect(akeys.sort()) + '\n != ' + util.inspect(ekeys.sort()))
      : false;

    for (let i = 0; i < ekeys.length; ++i) {
      const key = ekeys[i];
      if (! deepEqual(actual[key], expected[key], hint, hintField))
        return badKey(key);
    }
    for (let i = 0; i < akeys.length; ++i) {
      const key = akeys[i];
      if (! hasOwn(expected, key))
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

    function setHint(aobj=actual, eobj=expected, prefix) {
      if (! hint) return false;
      const prev = hint[hintField];

      hint[hintField] = (prefix || '') + format("\n    {i0}\n != {i1}", aobj, eobj) +
        (prev ? "\n" + prev : '');
      return false;
    }
  }
});
