define(function(require, exports, module) {
  var util = require('./util-base');

  function match(test, message) {
    return new Match(test, message);
  }

  function Match(test, message) {
    this.$test = test;
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
    date: match(function (value) {
      return !! value && value.constructor === Date && value.getDate() === value.getDate();
    }, 'match.date'),
    baseObject: match(function (value) {return !! value && value.constructor === Object}, 'match.baseObject'),
    object: match(function (value) {return !! value && typeof value === 'object'}, 'match.object'),
    func: match(match.function.$test, 'match.func'),
    match: match(function (value) {return !! value && value.constructor === Match}, 'match.match'),
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
    or: function () {
      var len = arguments.length;
      if (typeof arguments[len-1] === 'string')
        var name = arguments[--len];
      var args = util.slice(arguments, 0, len);
      return match(function (value) {
        return args.some(function (match) {
          return match.$test(value);
        });
      }, name || 'match.or');
    },
    and: function () {
      var len = arguments.length;
      if (typeof arguments[len-1] === 'string')
        var name = arguments[--len];
      var args = util.slice(arguments, 0, len);
      return match(function (value, msg) {
        var mthd = msg ? '$throwTest' : '$test';

        return args.every(function (match) {
          return match[mthd](value, msg);
        });
      }, name || 'match.and');
    }
  });

  return match;
});
