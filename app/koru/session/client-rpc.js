define(function(require, exports, module) {
  var session = require('./base');
  var sessState = require('./state');

  require('./client-rpc-base')(session, sessState);

  return session;
});
