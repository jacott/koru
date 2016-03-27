define(function(require, exports, module) {
  var test = require('./main');
  var session = require('koru/session');
  var localStorage = require('koru/local-storage');
  var koru = require('koru');
  var Module = module.constructor;

  test.testHandle = function (cmd, msg) {
    session.send('T', cmd+msg);
  };

  test.logHandle = function (type, msg) {
    if (type === 'ERROR')
      session.send('E', msg);
    else
      session.send('L', type + ': ' + msg);
  };

  var ls;

  session.provide('T', function (data) {
    var pattern = data[0];
    var tests = data[1];

    test.run(pattern, tests);
  });

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

  test.testHandle('A');

  return test;
});
