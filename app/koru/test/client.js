define(function(require, exports, module) {
  var test = require('./main');
  var session = require('../session/base');
  var localStorage = require('../local-storage');
  var koru = require('koru');
  var Module = module.constructor;

  test.testHandle = function (cmd, msg) {
    session.send('T', cmd+msg);
  };

  test.logHandle = function (msg) {
    session.send('L', msg);
  };

  var ls;

  var setItem = localStorage.setItem;
  var getItem = localStorage.getItem;
  var removeItem = localStorage.removeItem;

  koru.onunload(module, function () {
    requirejs.onError = null;
  });

  module.ctx.onError = function (err, mod) {
    if (err.onload) {
      var errEvent = err.event;
      var uer = errEvent && errEvent.error;
      session.send('E', koru.util.extractError({
        toString: function () {
          return uer ? uer.toString() : err.toString();
        },
        stack: "\tat "+ errEvent.filename + ':' + errEvent.lineno + ':' + errEvent.colno,
      }));
    } else if (mod.onError)
      return; // handled already
    err = koru.util.extractError(err);
    session.send('E', err);
  };

  test.geddon.onStart(function () {
    localStorage.setItem = function (key, value) {
      ls[key] = value;
    };

    localStorage.getItem = function (key) {
      return ls[key];
    };

    localStorage.removeItem = function (key) {
      delete ls[key];
    };
  });

  test.geddon.onTestStart(function () {
    ls = {};
  });

  test.geddon.onEnd(function () {
    ls = null;
    localStorage.setItem = setItem;
    localStorage.getItem = getItem;
    localStorage.removeItem = removeItem;
  });

  return test;
});
