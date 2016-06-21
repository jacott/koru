define(function(require) {
  const koru = require('../main');
  const base = require('./base');

  function Constructor(env, base) {
    env(base);
    return base;
  }

  const session = Constructor(require('../env!./main'), base);
  session.__init__ = Constructor;
  return session;
});
