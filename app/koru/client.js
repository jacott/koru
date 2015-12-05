define(function (require, exports, module) {
  var koru = require('./main');
  var session = require('./session/main');
  require('./ui/helpers');

  koru.onunload(module, function () {
    requirejs.onError = null;
  });

  requirejs.onError = function (err) {
    var name = err.requireModules && err.requireModules[0];
    name && koru.unload(name, err);

    err = koru.util.extractError(err);
    session.send('E', err);
    koru.error(err);
  };

  return koru;
});
