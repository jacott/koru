define((require)=>{
  const format          = require('koru/format');
  const util            = require('koru/util');
  const match           = require('koru/match').__initBase__();

  const {inspect, extractError, hasOwn} = util;

  const {is} = Object;

  class AssertionError extends Error {
  }
  AssertionError.name = AssertionError.prototype.name = 'AssertionError';

  let elidePoint = null;

  const fail = (message, elidePoint=null) =>{
    message = message ? message.toString() : 'no message';
    let ex;
    if (elidePoint !== null) {
      const {stack} = elidePoint;
      if (typeof stack != 'string') throw new AssertionError(message);

      ex = elidePoint;
      ex.message = message;

      let idx = 0;
      for(let i = 0; idx != -1 && i < 3; ++i) {
        idx = stack.indexOf("\n", idx+1);
      }
      if (idx != -1)
        ex.stack = message+stack.slice(idx);
      throw ex;
    } else {
      throw new AssertionError(message);
    }
  };

  const assert = (truth, msg)=>{
    ++Core.assertCount;
    let {__msg} = Core;
    const ep = elidePoint;
    Core.__msg = null;
    elidePoint = null;

    if (truth) return truth;

    msg = msg || 'Expected truthness';
    if (__msg) {
      if (typeof __msg === 'function') __msg = __msg();
      msg = `${__msg}; ${msg}`;
    }
    fail(msg, ep);
  };

  const refute = (truth, msg)=>{
    Core.assert(!truth, msg || 'Did not expect ' + util.inspect(truth));
  };

  function getElideFromStack() {
    elidePoint = elidePoint || new AssertionError('');
    return this;
  }
  Object.defineProperty(assert, 'elideFromStack', {get: getElideFromStack});
  Object.defineProperty(refute, 'elideFromStack', {get: getElideFromStack});

  assert.msg = msg =>(Core.__msg = msg, assert);
  refute.msg = msg =>(Core.__msg = msg, refute);

  const compileOptions = options=>{
    if (! options.assertMessage)
      options.assertMessage = 'Expected ' + (options.message || 'success');

    if (! options.refuteMessage)
      options.refuteMessage = 'Did not Expect ' + (options.message || 'success');

    options.assertMessage = format.compile(options.assertMessage);
    options.refuteMessage = format.compile(options.refuteMessage);
    return options;
  };

  const assertFunc = (pass, options)=>{
    const func = options.assert;
    return (...args)=>{
      const sideAffects = {_asserting: pass};

      if (pass === ! func.apply(sideAffects, args)) {
        args.push(sideAffects);
        Core.assert(false, format(
          pass ? options.assertMessage : options.refuteMessage, ...args));
      } else
        Core.assert(true);
      return pass ? assert : refute;
    };
  };

  const deepEqual = (actual, expected, hint, hintField, maxLevel=util.MAXLEVEL)=>{
    if (is(actual, expected)) {
      return true;
    }

    const setHint = (aobj=actual, eobj=expected, prefix)=>{
      if (! hint) return false;
      const prev = hint[hintField];

      hint[hintField] = (prefix || '') + format("\n    {i0}\n != {i1}", aobj, eobj) +
        (prev ? "\n" + prev : '');
      return false;
    };

    if (match.match.$test(expected))
      return expected.$test(actual) || setHint();

    const badKey = key =>{
      if (hint) {
        hint[hintField] = `at key = ${util.qstr(key)}${hint[hintField]||''}`;
        setHint();
      }
      return false;
    };

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

    if (Object.getPrototypeOf(actual) === Object.getPrototypeOf(expected)) {
      if (actual instanceof Date)
        return actual.getTime() === expected.getTime() || setHint();

      if (actual instanceof RegExp) {
        return actual.source === expected.source && actual.flags === expected.flags;
      }
    }

    if (maxLevel == 0)
      throw new Error('deepEqual maxLevel exceeded');

    if (Array.isArray(actual)) {
      if (! Array.isArray(expected))
        return setHint();
      const len = actual.length;
      if (expected.length !== len)
        return hint ? setHint(actual, expected, ' lengths differ: ' + actual.length + ' != ' + expected.length) : false;
      for(let i = 0; i < len; ++i) {
        if (! deepEqual(actual[i], expected[i], hint, hintField, maxLevel-1)) return setHint();
      }
      return true;
    } else if (Array.isArray(expected))
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
      if (! deepEqual(actual[key], expected[key], hint, hintField, maxLevel-1))
        return badKey(key);
    }
    for (let i = 0; i < akeys.length; ++i) {
      const key = akeys[i];
      if (! hasOwn(expected, key))
        return badKey(key);
    }
    return true;
  };

  const Core = {
    _init() {
      this.testCount = this.skipCount = this.assertCount = 0;
    },
    fail(message) {assert(false, message);},
    abort(ex) {throw ex},
    get __elidePoint() {return elidePoint},
    set __elidePoint(v) {elidePoint = v},

    AssertionError,
    test: undefined,

    assert, refute,

    assertions: {
      add(name, options) {
        compileOptions(options);
        assert[name] = assertFunc(true, options);
        refute[name] = assertFunc(false, options);
      },
    },

    match,
    deepEqual,
  };
  Core._init();

  return Core;
});
