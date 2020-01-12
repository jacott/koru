define((require, exports, module)=>{
  'use strict';
  const SWManager       = require('koru/client/sw-manager');
  const Session         = require('koru/session');
  const KoruStartup     = require('koru/startup-client');
  const UserAccount     = require('koru/user-account');

  KoruStartup.restartOnUnload(require, module);

  return KoruStartup.startStop(
    SWManager,
    UserAccount,
    Session
  );
});
