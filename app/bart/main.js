/*global define requirejs window*/

define(function (require, exports, module) {
  var core = require('bart/core');
  var session = require('bart/session-client');

  window.addEventListener('error', function (ev) {
    try {
      if (ev.error.constructor === window.SyntaxError) {
        session.send('E', core.util.extractError({
          toString: function () {
            return ev.error.toString();
          },
          stack: "\tat "+ ev.filename + ':' + ev.lineno + ':' + ev.colno,
        }));
      }
    } finally {
      throw ev;
    }
  });

  requirejs.onError = function (err) {
    var name = err.requireModules && err.requireModules[0];
    name && requirejs.undef(name);

    try {
      session.send('E', core.util.extractError(err));
    } finally {
      throw err;
    }
  };

  return core;
});
