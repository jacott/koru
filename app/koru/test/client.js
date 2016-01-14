define(function(require, exports, module) {
  var test = require('./main');
  var session = require('../session/base');
  var localStorage = require('../local-storage');
  var koru = require('koru');
  var Module = module.constructor;

  test.testHandle = function (cmd, msg) {
    session.send('T', cmd+msg);
  };

  test.logHandle = function (type, msg) {
    session.send(type === 'ERROR' ? 'E' : 'L', msg);
  };

  var ls;

  var setItem = localStorage.setItem;
  var getItem = localStorage.getItem;
  var removeItem = localStorage.removeItem;

  koru.onunload(module, function () {
    requirejs.onError = null;
  });

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
