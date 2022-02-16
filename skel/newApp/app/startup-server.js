define((require, exports, module) => {
  'use strict';
  const bootstrap       = require('koru/migrate/bootstrap');
  const AllPub          = require('koru/pubsub/all-pub');
  const KoruStartup     = require('koru/startup-server');
  const UserAccount     = require('koru/user-account');

  KoruStartup.restartOnUnload(require, module);

  return async () => {
    await bootstrap();
    if (AllPub.pubName === void 0) AllPub.pubName = 'All';
    UserAccount.start();
  };
});
