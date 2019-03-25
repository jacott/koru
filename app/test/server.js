define((require)=>{
  'use strict';
  require('koru/server');
  require('koru/session');
  require('koru/css/less-watcher');
  require('koru/server-rc');
  const webServer = require('koru/web-server');
  require('koru/test/server');
  require('koru/test/api');

  return ()=>{
    webServer.start();
    console.log('=> Ready');
  };
});
