define(function(require, exports, module) {
  var util = require('./util-base');

  function Constructor() {
    function match(test, message) {
      return new Match(test, message);
    }

    function Match(test, message) {
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

    Match.prototype = {
      constructor: Match,

      toString: toString,
      $inspect: toString,
      $throwTest: function (value) {
        if (! this.$test(value, 'throw')) {
          throw this.message;
        }
        return true;
      }
    };

    function toString() {
      return ''+this.message;
    }

    'string number boolean undefined function'.split(' ').forEach(function (t) {
      match[t] = match(function (value) {
        return typeof value === t;
      }, 'match.'+t);
    });

    util.extend(match, {
      any: match(function () {return true}, 'match.any'),
      null: match(function (value) {return value === null}, 'match.null'),
      nil: match(function (value) {return value == null}, 'match.nil'),
      date: match(function (value) {
        return !! value && value.constructor === Date && value.getDate() === value.getDate();
      }, 'match.date'),
      baseObject: match(function (value) {return !! value && value.constructor === Object}, 'match.baseObject'),
      object: match(function (value) {return !! value && typeof value === 'object'}, 'match.object'),
      func: match(match.function.$test, 'match.func'),
      match: match(function (value) {return !! value && value.constructor === Match}, 'match.match'),
      id: match(function (value) {return /^[a-z0-9]{3,24}$/i.test(value)}, 'match.id'),
      equal: function (expected, name) {
        return match(function (value) {
          return util.deepEqual(value, expected);
        }, name || 'match.equal');
      },
      regExp: function (regexp, name) {
        return match(function (value) {
          return typeof value === 'string' &&
            regexp.test(value);
        }, name || 'match.regExp');
      },
      has: function (set, name) {
        return match(function (value) {
          return set.hasOwnProperty(value);
        }, name || 'match.has');
      },
      or: function (...args) {
        var len = args.length;
        if (typeof args[len-1] === 'string')
          var name = args.pop();
        return match(function (value) {
          return args.some(function (match) {
            return match.$test(value);
          });
        }, name || 'match.or');
      },
      and: function (...args) {
        var len = args.length;
        if (typeof args[len-1] === 'string')
          var name = args.pop();
        return match(function (value, msg) {
          var mthd = msg ? '$throwTest' : '$test';

          return args.every(function (match) {
            return match[mthd](value, msg);
          });
        }, name || 'match.and');
      },
      tuple: function (array, name) {
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


    return match;

  }

  exports = Constructor();
  exports.__initBase__ = Constructor;
  return exports;
});
