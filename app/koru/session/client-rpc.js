define(function(require, exports, module) {
  var session = require('./base');

  require('./client-rpc-base')(session);

  return session;
});
