define(function(require, exports, module) {
  const SessionBase  = new (require('koru/session/base').constructor)('test');
  const koru         = require('koru/client'); // load client so we can override koru.logger
  const localStorage = require('koru/local-storage');
  const sessState    = require('koru/session/state').constructor();
  const util         = require('koru/util');
  const test         = require('./main');

  const Module = module.constructor;
  const session = require('koru/session/main-client')(SessionBase, sessState);

  test.session = session;

  test.testHandle = function (cmd, msg) {
    session.send('T', cmd+msg);
  };

  test.logHandle = function (type, msg) {
    if (type === 'ERROR')
      session.send('E', msg);
    else
      session.send('L', type + ': ' + msg);
  };

  koru.logger = function (type, ...args) {
    console.log.apply(console, args);
    if (type === 'ERROR')
      session.send('E', args.join(' '));
    else
      session.send("L", type+ ": " + (type === '\x44EBUG' ? util.inspect(args, 7) : args.join(' ')));
  };

  let ls;

  session.provide('T', function (data) {
    var pattern = data[0];
    var tests = data[1];

    test.run(pattern, tests);
  });

  const setItem = localStorage.setItem;
  const getItem = localStorage.getItem;
  const removeItem = localStorage.removeItem;

  koru.onunload(module, function () {
    requirejs.onError = null;
  });

  test.geddon.abort = function (ex) {
    test.logHandle('E', koru.util.extractError(ex)+"\n\n**** Tests aborted! *****");
    test.testHandle('F', test.geddon.testCount + 1);
    test.geddon.reload = true;
    throw ex;
  };

  localStorage._resetValue = function () {return Object.create(null)};
  test.geddon.onStart(function () {
    localStorage.setItem = function (key, value) {
      const oldValue = ls[key];
      ls[key] = value;
    };

    localStorage.getItem = function (key) {
      return ls[key];
    };

    localStorage.removeItem = function (key) {
      delete ls[key];
    };
  });

  test.geddon.onTestStart(function () {ls = localStorage._resetValue()});

  test.geddon.onEnd(function () {
    ls = null;
    localStorage.setItem = setItem;
    localStorage.getItem = getItem;
    localStorage.removeItem = removeItem;
  });

  test.testHandle('A');

  session.connect();

  return test;
});
