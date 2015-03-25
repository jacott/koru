define(function(require, exports, module) {
  var util = require('./util');

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
  };

  function toString() {
    return ''+this.message;
  }

  util.forEach('string number boolean undefined function'.split(' '), function (t) {
    match[t] = match(function (value) {
      return typeof value === t;
    }, 'match.'+t);
  });

  util.extend(match, {
    any: match(function () {return true}, 'match.any'),
    null: match(function (value) {return value === null}, 'match.null'),
    date: match(function (value) {return !! value && value.constructor === Date}, 'match.date'),
    baseObject: match(function (value) {return !! value && value.constructor === Object}, 'match.baseObject'),
    object: match(function (value) {return !! value && typeof value === 'object'}, 'match.object'),
    func: match(match.function.$test, 'match.func'),
    match: match(function (value) {return !! value && value.constructor === Match}, 'match.match')
  });

  return match;
});
