define(function(require, exports, module) {
  var koru = require('koru');
  var startup = require('./startup-server');
  var webServer = require('koru/web-server');
  var session = require('koru/session');
  var IdleCheck = require('koru/idle-check').singleton;

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
