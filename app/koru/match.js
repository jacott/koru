define((require)=>{
  const util = require('./util-base');

  const match$ = Symbol();

  const {inspect$} = require('koru/symbols');

  const {hasOwn} = util;
  const {is} = Object;

  function Constructor() {
    const match = (test, name) => new Match(test, name);

    class Match {
      constructor(test, message=`match(${test.name||test})`) {
        if (typeof test === 'function')
          this[match$] = test;
        else switch(test.constructor) {
        case RegExp:
          this[match$] = value => typeof value === 'string' && test.test(value);
          break;
        default:
          this[match$] = value => util.deepEqual(value, test);
        }
        this.message = message;
      }

      test(actual, $throwTest) {return this[match$](actual, $throwTest)}

      $throwTest(value) {
        if (! this.test(value, '$throwTest')) {
          throw this.toString();
        }
        return true;
      }

      toString() {
        const {message} = this;
        return typeof message === 'function'
          ? message() : ''+message;
      }
    };

    match.make = (obj, test)=>{obj[match$] = test};

    match.isMatch = matchable => matchable != null && matchable[match$] !== undefined;
    match.test = (matchable, actual)=> matchable == null || matchable[match$] === undefined
      ? util.deepEqual(actual, matchable) : matchable[match$](actual);

    match.optional = m => match(
      (value, mthd=match$) => value == null ||
        m[mthd](value), m.message+'[opt]');

    'string number boolean undefined function'.split(' ').forEach(t => {
      match.optional[t] = match.optional(
        match[t] = match(value => typeof value === t, `match.${t}`));
    });

    const MATCHERS = {
      any: match(() => true, 'match.any'),
      null: match(value => value === null, 'match.null'),
      nil: match(value => value == null, 'match.nil'),
      date: match(value => value != null && value.constructor === Date &&
                  value.getDate() === value.getDate(), 'match.date'),
      error: match(value => value instanceof Error, 'match.error'),
      integer: match(value => typeof value === 'number' && Math.floor(value) === value, 'match.integer'),
      baseObject: match(value => value != null && value.constructor === Object, 'match.baseObject'),
      object: match(value => typeof value === 'object' && value !== null, 'match.object'),
      func: match(match.function[match$], 'match.func'),
      match: match(match.isMatch, 'match.match'),
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
      is(expected, name=()=> `match.is(${util.inspect(expected)})`) {
        return match(value => is(value, expected), name);
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
        return match(value => args.some(match => match[match$](value)),
                     typeof args[args.length-1] === 'string' ? args.pop() : 'match.or');
      },
      and(...args) {
        return match((value, mthd=match$) => {
          return args.every(match => match[mthd](value));
        }, typeof args[args.length-1] === 'string' ? args.pop() : 'match.and');
      },
      not(arg) {
        return match(value => ! arg[match$](value), ()=> `match.not(${arg})`);
      },
      tuple(array, name='match.tuple') {
        const len = array.length;
        return match((value, mthd=match$) => {
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

  const Match = Constructor();
  Match.__initBase__ = Constructor;
  return Match;
});
