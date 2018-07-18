define((require)=>{
  const session         = require('./main');

  require('./client-rpc-base')(session);

  return session;
});
