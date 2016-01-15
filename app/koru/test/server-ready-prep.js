define(function(require, exports, module) {
  return function (koru, BuildCmd) {
    koru.onunload(module, function () {
      BuildCmd.serverReady && BuildCmd.serverReady.return('ready');
    });
  };
});
