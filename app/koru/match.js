define(function(require, exports, module) {
  const util = require('./util-base');

  const {inspect$} = require('koru/symbols');

  const {hasOwn} = util;

  function Constructor() {
    const match = (test, message) => new Match(test, message);

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
        if (! this.$test(value, 'throw')) {
          throw this.message;
        }
        return true;
      }
    };


    'string number boolean undefined function'.split(' ').forEach(t => {
      match[t] = match(value => typeof value === t, `match.${t}`);
    });

    util.merge(match, {
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
      id: match(value => /^[a-z0-9]{3,24}$/i.test(value), 'match.id'),
      equal (expected, name) {
        return match(value => util.deepEqual(value, expected), name || 'match.equal');
      },
      is (expected, name) {
        return match(value => util.is(value, expected), name || 'match.is');
      },
      regExp (regexp, name) {
        return match(value => typeof value === 'string' &&
                     regexp.test(value), name || 'match.regExp');
      },
      has (set, name) {
        return match(value => hasOwn(set, value), name || 'match.has');
      },
      or (...args) {
        return match(value => args.some(match => match.$test(value)),
                     typeof args[args.length-1] === 'string' ? args.pop() : 'match.or');
      },
      and (...args) {
        return match((value, msg) => {
          const mthd = msg ? '$throwTest' : '$test';

          return args.every(match => match[mthd](value, msg));
        }, typeof args[args.length-1] === 'string' ? args.pop() : 'match.and');
      },
      tuple (array, name) {
        const len = array.length;
        return match((value, msg) => {
          const mthd = msg ? '$throwTest' : '$test';

          if (! Array.isArray(value) || value.length !== len)
            return false;

          for(let i = 0; i < len; ++i) {
            const sm = array[i];
            if (mthd in sm) {
              if (! sm[mthd](value[i], msg))
                return false;
            } else {
              if (! util.deepEqual(value[i], sm))
                return false;
            }
          }
          return true;
        }, name || 'match.tuple');
      },
    });

    Match.prototype[inspect$] = Match.prototype.toString;

    return match;

  }

  exports = Constructor();
  exports.__initBase__ = Constructor;
  return exports;
});
