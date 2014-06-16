define(function(require) {
  var koru = require('../main');
  var session = require('./base');

  require('../env!./main')(session);

  return session;
});
