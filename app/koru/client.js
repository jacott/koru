define(function (require, exports, module) {
  var env = require('./env');
  var session = require('./session/client-main');

  window.addEventListener('error', function (ev) {
    var badIds = env.discardIncompleteLoads().join("\n");

    session.send('E', env.util.extractError({
      toString: function () {
        return ev.error.toString();
      },
      stack: "\tat "+ ev.filename + ':' + ev.lineno + ':' + ev.colno,
    }) +  "\nWhile loading:\n" + badIds);
  });

  requirejs.onError = function (err) {
    var name = err.requireModules && err.requireModules[0];
    name && env.unload(name);

    session.send('E', env.util.extractError(err));
    throw err;
  };

  session.connect();

  return env;
});
