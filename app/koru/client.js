define(function (require, exports, module) {
  var koru = require('./main');
  var session = require('./session/main');
  require('./ui/helpers');

  koru.onunload(module, function () {
    requirejs.onError = null;
  });


  window.yaajs.module.ctx.onError = function (err) {
    err = koru.util.extractError(err);
    session.send('E', err);
    koru.error(err);
  };

  return koru;
});
