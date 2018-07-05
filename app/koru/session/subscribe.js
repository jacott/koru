define((require)=>{
  const session          = require('koru/session');
  const subscribeFactory = require('koru/session/subscribe-factory');

  return subscribeFactory(session);
});
