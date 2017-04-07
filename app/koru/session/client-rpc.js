define(function(require, exports, module) {
  const session = require('./main');

  require('./client-rpc-base')(session);

  return session;
});
