define(function(require, exports, module) {
  const util = require('./util-base');

  function Constructor() {
    function match(test, message) {
      return new Match(test, message);
    }

    class Match {
      constructor (test, message) {
        if (typeof test === 'function')
          this.$test = test;
        else switch(test.constructor) {
        case RegExp:
          this.$test = function (value) {
            return typeof value === 'string' &&
              test.test(value);
          };
          break;
        default:
          this.$test = function (value) {
            return util.deepEqual(value, test);
          };
        }
        this.message = message || 'match('+(test.name||test)+')';
      }

      toString () {
        return ''+this.message;
      }

      $throwTest (value) {
        if (! this.$test(value, 'throw')) {
          throw this.message;
        }
        return true;
      }
    };


    'string number boolean undefined function'.split(' ').forEach(function (t) {
      match[t] = match(function (value) {
        return typeof value === t;
      }, 'match.'+t);
    });

    util.extend(match, {
      any: match(() => true, 'match.any'),
      null: match(value => value === null, 'match.null'),
      nil: match(value => value == null, 'match.nil'),
      date: match(value => !! value && value.constructor === Date && value.getDate() === value.getDate(), 'match.date'),
      baseObject: match(value => !! value && value.constructor === Object, 'match.baseObject'),
      object: match(value => !! value && typeof value === 'object', 'match.object'),
      func: match(match.function.$test, 'match.func'),
      match: match(value => !! value && value.constructor === Match, 'match.match'),
      id: match(value => /^[a-z0-9]{3,24}$/i.test(value), 'match.id'),
      equal (expected, name) {
        return match(function (value) {
          return util.deepEqual(value, expected);
        }, name || 'match.equal');
      },
      is (expected, name) {
        return match(value => util.is(value, expected), name || 'match.is');
      },
      regExp (regexp, name) {
        return match(value => typeof value === 'string' &&
                     regexp.test(value), name || 'match.regExp');
      },
      has (set, name) {
        return match(value => set.hasOwnProperty(value), name || 'match.has');
      },
      or (...args) {
        var len = args.length;
        if (typeof args[len-1] === 'string')
          var name = args.pop();
        return match(value => args.some(match => match.$test(value)), name || 'match.or');
      },
      and (...args) {
        var len = args.length;
        if (typeof args[len-1] === 'string')
          var name = args.pop();
        return match((value, msg) => {
          var mthd = msg ? '$throwTest' : '$test';

          return args.every(match => match[mthd](value, msg));
        }, name || 'match.and');
      },
      tuple (array, name) {
        var len = array.length;
        return match(function (value, msg) {
          var mthd = msg ? '$throwTest' : '$test';

          if (! Array.isArray(value) || value.length !== len)
            return false;

          for(var i = 0; i < len; ++i) {
            var sm = array[i];
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

    Match.prototype.$inspect = Match.prototype.toString;

    return match;

  }

  exports = Constructor();
  exports.__initBase__ = Constructor;
  return exports;
});
