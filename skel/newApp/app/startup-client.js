define(function(require, exports, module) {
  const koru        = require('koru');
  const session     = require('koru/session');
  const Route       = require('koru/ui/route');
  const userAccount = require('koru/user-account');
  const util        = require('koru/util');

  module.exports = {
    start,
    stop,
  };

  koru.onunload(module, restart);

  function restart(mod, error) {
    Route.replacePage(null);
    stop();
    if (error) return;
    const modId = mod.id;
    window.requestAnimationFrame(function () {
      require(modId, function (sc) {
        sc.start && sc.start();
      });
    });
  }


  function start() {
    userAccount.init();
    session.connect();
  }

  function stop() {
    session.stop();
    userAccount.stop();
  }
});
