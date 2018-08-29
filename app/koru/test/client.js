define((require, exports, module)=>{
  const SessionBase = new (require('koru/session/base').constructor)('test');
  const koru            = require('koru/client'); // load client so we can override koru.logger
  const localStorage    = require('koru/local-storage');
  const sessState       = require('koru/session/state').constructor();
  const util            = require('koru/util');
  const test            = require('./main');


  const Module = module.constructor;
  const session = require('koru/session/main-client')(SessionBase, sessState);

  test.session = session;

  test.testHandle = (cmd, msg)=>{session.send('T', cmd+msg)};

  test.logHandle = (type, msg)=>{
    if (type === 'ERROR')
      session.send('E', msg);
    else
      session.send('L', type + ': ' + msg);
  };

  koru.logger = (type, ...args)=>{
    console.log.apply(console, args);
    if (type === 'ERROR')
      session.send('E', args.join(' '));
    else
      session.send("L", type+ ": " + (
        type === '\x44EBUG' ? util.inspect(args, 7) :
          args.join(' ')));
  };

  let ls;

  session.provide('T', data => {test.run(data[0], data[1])});

  const setItem = localStorage.setItem;
  const getItem = localStorage.getItem;
  const clear = localStorage.clear;
  const removeItem = localStorage.removeItem;

  module.onUnload(() => {requirejs.onError = null});

  test.Core.abort = ex => {
    const {name, location: {name: fn, line}} = test.Core.test;
    test.logHandle('E', koru.util.extractError(ex) +
                   "\n\n**** Tests aborted! *****\n" +
                   name +
                   `\n     at - ${fn}.js:${line}`);
    test.testHandle('F', test.Core.testCount + 1);
    test.Core.reload = true;
    throw ex;
  };

  localStorage._resetValue = ()=>Object.create(null);
  test.Core.onStart(() => {
    localStorage.setItem = (key, value) => {
      const oldValue = ls[key];
      ls[key] = value;
    };

    localStorage.getItem = key => {
      const ans = ls[key];
      return ans === undefined ? null : ans;
    };
    localStorage.removeItem = key => {
      delete ls[key];
    };
    localStorage.clear = ()=>{
      ls = {};
    };
  });

  test.Core.onTestStart(()=>{ls = localStorage._resetValue()});

  test.Core.onEnd(()=>{
    ls = null;
    localStorage.setItem = setItem;
    localStorage.getItem = getItem;
    localStorage.removeItem = removeItem;
    localStorage.clear = clear;
  });

  test.testHandle('A');

  session.connect();

  return test;
});
