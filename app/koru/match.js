define(function(require, exports, module) {
  const util = require('./util-base');

  const {inspect$} = require('koru/symbols');

  const {hasOwn} = util;

  function Constructor() {
    const match = (test, name) => new Match(test, name);

    class Match {
      constructor(test, message=`match(${test.name||test})`) {
        if (typeof test === 'function')
          this.$test = test;
        else switch(test.constructor) {
        case RegExp:
          this.$test = value => typeof value === 'string' && test.test(value);
          break;
        default:
          this.$test = value => util.deepEqual(value, test);
        }
        this.message = message;
      }

      toString() {
        return `${this.message}`;
      }

      $throwTest(value) {
        if (! this.$test(value, '$throwTest')) {
          throw this.message;
        }
        return true;
      }

    };

    match.optional = m => match(
      (value, mthd='$test') => value == null ||
        m[mthd](value), m.message+'[opt]');

    'string number boolean undefined function'.split(' ').forEach(t => {
      match.optional[t] = match.optional(
        match[t] = match(value => typeof value === t, `match.${t}`));
    });

    const MATCHERS = {
      any: match(() => true, 'match.any'),
      null: match(value => value === null, 'match.null'),
      nil: match(value => value == null, 'match.nil'),
      date: match(value => value != null && value.constructor === Date && value.getDate() === value.getDate(), 'match.date'),
      integer: match(value => typeof value === 'number' && Math.floor(value) === value, 'match.integer'),
      baseObject: match(value => value != null && value.constructor === Object, 'match.baseObject'),
      object: match(value => typeof value === 'object' && value !== null, 'match.object'),
      func: match(match.function.$test, 'match.func'),
      match: match(value => value != null && value.constructor === Match, 'match.match'),
      symbol: match(value => value != null && value.constructor === Symbol, 'match.Symbol'),
      id: match(value => value !== 'undefined' && /^[a-z0-9]{3,24}$/i.test(value), 'match.id'),
    };

    for (const t in MATCHERS) {
      match.optional[t] = match.optional(
        match[t] = MATCHERS[t]);
    }

    Object.assign(match, {
      equal(expected, name='match.equal') {
        return match(value => {return util.deepEqual(value, expected)}, name);
      },
      is(expected, name='match.is') {
        return match(value => util.is(value, expected), name);
      },
      regExp(regexp, name='match.regExp') {
        return match(value => typeof value === 'string' &&
                     regexp.test(value), name);
      },
      between(from, to, incFrom=true, incTo=true, name='match.between') {
        return match(value => (incFrom ? value >= from : value > from) &&
                     (incTo ? value <= to : value < to), name);
      },
      has(set, name='match.has') {
        return match(value => hasOwn(set, value), name);
      },
      or(...args) {
        return match(value => args.some(match => match.$test(value)),
                     typeof args[args.length-1] === 'string' ? args.pop() : 'match.or');
      },
      and(...args) {
        return match((value, mthd='$test') => {
          return args.every(match => match[mthd](value));
        }, typeof args[args.length-1] === 'string' ? args.pop() : 'match.and');
      },
      tuple(array, name='match.tuple') {
        const len = array.length;
        return match((value, mthd='$test') => {
          if (! Array.isArray(value) || value.length !== len)
            return false;

          for(let i = 0; i < len; ++i) {
            const sm = array[i];
            if (mthd in sm) {
              if (! sm[mthd](value[i]))
                return false;
            } else {
              if (! util.deepEqual(value[i], sm))
                return false;
            }
          }
          return true;
        }, name);
      },
    });

    Match.prototype[inspect$] = Match.prototype.toString;

    return match;
  }

  exports = Constructor();
  exports.__initBase__ = Constructor;
  return exports;
});
