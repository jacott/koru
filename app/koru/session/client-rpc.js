define(function(require, exports, module) {
  var session = require('./main');

  require('./client-rpc-base')(session);

  return session;
});
