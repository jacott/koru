define(function(require) {
  var koru = require('../main');
  var base = require('./base');

  function Constructor(QueryEnv, base) {
    QueryEnv(base);
    return base;
  }

  exports = Constructor(require('../env!./main'), base);
  exports.__init__ = Constructor;
  return exports;
});
