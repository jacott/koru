define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const IdleCheck       = require('koru/idle-check').singleton;
  const session         = require('koru/session');
  const webServer       = require('koru/web-server');
  const startup         = require('./startup-server');

  koru.onunload(module, 'reload');

  return () => {
    startup();

    process.on('SIGTERM', () => {
      console.log('Closing [SIGTERM]');
      webServer.stop();
      session.stop();
      IdleCheck.waitIdle(() => {
        console.log('=> Shutdown ' + new Date());
        process.exit(0);
      });
    });

    webServer.start();
    console.log('=> Ready');
  };
});
