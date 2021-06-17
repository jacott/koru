define((require) => {
  'use strict';
  const format          = require('koru/format');
  const stacktrace      = require('koru/stacktrace');
  const callbacks       = require('koru/test/callbacks');
  const util            = require('koru/util');

  const {private$} = require('koru/symbols');

  const match = require('koru/match')[isTest];

  const {inspect, extractError, hasOwn, qstr, last} = util;

  const {is} = Object;

  class AssertionError extends Error {
    constructor(message, elidePoint=0) {
      super(message);
      if (typeof elidePoint === 'number')
        stacktrace.elideFrames(this, elidePoint);
      else
        stacktrace.replaceStack(this, elidePoint);
    }

    get name() {return 'AssertionError'}
  }


  let elidePoint = void 0;

  const fail = (message='failed', elidePoint=0) => {
    throw new AssertionError(message, typeof elidePoint === 'number' ? elidePoint+1 : elidePoint);
  };

  const assert = (truth, msg) => {
    ++Core.assertCount;
    let {__msg} = Core;
    const ep = elidePoint;
    Core.__msg = null;
    elidePoint = void 0;

    if (truth) return truth;

    msg = msg || 'Expected truthness';
    if (__msg) {
      if (typeof __msg === 'function') __msg = __msg();
      msg = `${__msg}; ${msg}`;
    }
    fail(msg, ep);
  };

  assert.fail = fail;
  assert.elide = (body, adjust=0) => {
    try {
      return body();
    } catch(ex) {
      if (ex.name === 'AssertionError')
        assert.fail(ex.message, adjust+2);
      throw ex;
    }
  };

  const refute = (truth, msg) => {
    Core.assert(!truth, msg || 'Did not expect ' + util.inspect(truth));
  };

  function getElideFromStack() {
    elidePoint = elidePoint || new AssertionError('', 2);
    return this;
  }
  Object.defineProperty(assert, 'elideFromStack', {get: getElideFromStack});
  Object.defineProperty(refute, 'elideFromStack', {get: getElideFromStack});

  assert.msg = (msg) => (Core.__msg = msg, assert);
  refute.msg = (msg) => (Core.__msg = msg, refute);

  const compileOptions = (options) => {
    if (! options.assertMessage)
      options.assertMessage = 'Expected ' + (options.message || 'success');

    if (! options.refuteMessage)
      options.refuteMessage = 'Did not Expect ' + (options.message || 'success');

    options.assertMessage = format.compile(options.assertMessage);
    options.refuteMessage = format.compile(options.refuteMessage);
    return options;
  };

  const assertFunc = (pass, options) => {
    const func = options.assert;
    return (...args) => {
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

  const qnlStr = (s) => qstr(s+'\n');

  const MultiStringJoin = ' +\n    ';
  const MultiStringNE = '\n != ';

  const formatStringDiff = (as, bs) => {
    if (Math.min(as.length, bs.length) < 20)
      return format('{i0}\n != {i1}', as, bs);
    const a = as.split('\n'), b = bs.split('\n');
    last(a) === '' && a.pop();
    last(b) === '' && b.pop();

    const la = a.length - 1, lb = b.length - 1;
    const minl = Math.min(la, lb) + 1;

    let dsl = -1;
    for (let i = 0; i < minl; ++i) {
      if (a[i] !== b[i]) {
        dsl = i;
        break;
      }
    }
    if (dsl == -1) dsl = minl;

    let ans = a.map(qnlStr).join(MultiStringJoin) + MultiStringNE;

    if (dsl > la) {
      return ans + b.map(qnlStr).join(MultiStringJoin) + '\n Is longer';
    }
    if (dsl > lb) {
      return ans + b.map(qnlStr).join(MultiStringJoin) + '\n Is shorter';
    } else {
      let del = -1;
      for(let i = 0; i < minl ; ++i) {
        if (a[la-i] !== b[lb-i]) {
          del = i;
          break;
        }
      }

      ans += b.slice(0, dsl + 1).map(qnlStr).join(MultiStringJoin);
      let a1 = qnlStr(a[dsl]), b1 = qnlStr(b[dsl]);
      if (a1[0] !== b1[0]) {
        if (a1[0] !== '"') a1 = JSON.stringify(a1);
        if (b1[0] !== '"') b1 = JSON.stringify(b1);
      }
      const len = Math.min(a1.length, b1.length);
      let s = 0;
      while(s < len && a1[s] === b1[s]) ++s;
      ans += '\n' + '-'.repeat(s+4) +'^ here\n    ';
      if (del > 0)
        return ans + '; the Remainder is the same';

      return ans + b.slice(dsl+1, lb - del + 1).map(qnlStr).join(MultiStringJoin);
    }
  };


  const deepEqual = (actual, expected, hint, hintField, maxLevel=util.MAXLEVEL) => {
    if (is(actual, expected)) {
      return true;
    }

    const setHint = (aobj=actual, eobj=expected, prefix) => {
      if (! hint) return false;
      const prev = hint[hintField];

      hint[hintField] = (prefix || '') + '\n    ' +
        (typeof aobj === 'string' && typeof eobj === 'string' ?
         formatStringDiff(aobj, eobj) :
         format('{i0}\n != {i1}', aobj, eobj)
        ) + (prev ? '\n' + prev : '');
      return false;
    };

    if (match.isMatch(expected))
      return match.test(expected, actual) || setHint();

    const badKey = (key) => {
      if (hint) {
        hint[hintField] = `at key = ${util.qlabel(key)}${hint[hintField]||''}`;
        setHint();
      }
      return false;
    };

    if (typeof actual !== 'object' || typeof expected !== 'object') {
      if ((actual === void 0 || expected === void 0) && actual == expected)
        return true;
      if (hint) {
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
      this.abortMode = void 0;
      this.testCount = this.skipCount = this.assertCount = 0;
    },
    abortMode: void 0,
    abort: void 0,
    get __elidePoint() {return elidePoint},
    set __elidePoint(v) {elidePoint = v},

    AssertionError,
    test: void 0,

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
    reload: false,
  };
  Core._init();

  callbacks(Core);

  return Core;
});
