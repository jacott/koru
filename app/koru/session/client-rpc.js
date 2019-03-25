define((require)=>{
  'use strict';
  const session         = require('./main');

  require('./client-rpc-base')(session);

  return session;
});
