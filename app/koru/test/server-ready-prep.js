define(function(require, exports, module) {
  var BuildCmd = require('koru/test/build-cmd');
  var koru = require('koru/main');

  koru.onunload(module, function () {
    BuildCmd.serverReady && BuildCmd.serverReady.return('ready');
  });
});
