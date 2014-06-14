define(function(require) {
  var env = require('../env');
  var session = require('./base');

  require('../env!./main')(session);

  return session;
});
