define((require) => {
  'use strict';
  require('koru/css/less-watcher');
  const koru            = require('koru/server');
  require('koru/server-rc');
  require('koru/session');
  require('koru/test/api');
  require('koru/test/server');
  const webServer       = require('koru/web-server');

  return async () => {
    await webServer.start();
    console.log('=> Ready');
  };
});
