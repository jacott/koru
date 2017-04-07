define(function(require, exports, module) {
  const koru      = require('koru');
  const IdleCheck = require('koru/idle-check').singleton;
  const session   = require('koru/session');
  const webServer = require('koru/web-server');
  const startup   = require('./startup-server');

  koru.onunload(module, 'reload');

  return function () {
    startup();

    process.on('SIGTERM', function () {
      console.log('Closing [SIGTERM]');
      webServer.stop();
      session.stop();
      IdleCheck.waitIdle(function () {
        console.log('=> Shutdown ' + new Date());
        process.exit(0);
      });
    });

    webServer.start();
    console.log('=> Ready');
  };
});
