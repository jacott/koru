define(function (require, exports, module) {
  var koru = require('./main');
  var session = require('./session/main');
  require('./ui/helpers');

  koru.onunload(module, function () {
    window.removeEventListener('error', errorListener);
    requirejs.onError = null;
  });

  window.addEventListener('error', errorListener);

  requirejs.onError = function (err) {
    var name = err.requireModules && err.requireModules[0];
    name && koru.unload(name, err);

    session.send('E', koru.util.extractError(err));
    throw err;
  };

  function errorListener(ev) {
    if (ev.error === 'reloading') return;
    var badIds = koru.discardIncompleteLoads(ev.error).join("\n");

    session.send('E', koru.util.extractError({
      toString: function () {
        return ev.error.toString();
      },
      stack: "\tat "+ ev.filename + ':' + ev.lineno + ':' + ev.colno,
    }) +  "\nWhile loading:\n" + badIds);
  }

  return koru;
});
