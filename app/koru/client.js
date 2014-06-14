define(function (require, exports, module) {
  var env = require('./env');
  var session = require('./session/main');
  require('./ui/helpers');

  env.onunload(module, function () {
    window.removeEventListener('error', errorListener);
    requirejs.onError = null;
  });

  window.addEventListener('error', errorListener);

  requirejs.onError = function (err) {
    var name = err.requireModules && err.requireModules[0];
    name && env.unload(name, err);

    session.send('E', env.util.extractError(err));
    throw err;
  };

  function errorListener(ev) {
    var badIds = env.discardIncompleteLoads().join("\n");

    session.send('E', env.util.extractError({
      toString: function () {
        return ev.error.toString();
      },
      stack: "\tat "+ ev.filename + ':' + ev.lineno + ':' + ev.colno,
    }) +  "\nWhile loading:\n" + badIds);
  }

  return env;
});
