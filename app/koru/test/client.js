define((require, exports, module)=>{
  'use strict';
  const SessionBase = new (require('koru/session/base').constructor)('test');
  const koru            = require('koru/client'); // load client so we can override koru.logger
  const localStorage    = require('koru/local-storage');
  const sessState       = require('koru/session/state').constructor();
  const util            = require('koru/util');
  const Test            = require('./main');

  const Module = module.constructor;
  const session = require('koru/session/main-client')(SessionBase, sessState);

  {
    const {serviceWorker} = navigator;
    if (serviceWorker != null && serviceWorker.controller != null) {
      serviceWorker.register(serviceWorker.controller.scriptURL).then(reg => {
        reg.unregister().then(koru.reload);
      });
      return;
    }
  }

  Test.session = session;

  Test.testHandle = (cmd, msg='')=>{session.send('T', cmd+msg)};

  Test.logHandle = (type, msg)=>{
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

  session.provide('T', data => {Test.run(data[0], data[1])});

  const setItem = localStorage.setItem;
  const getItem = localStorage.getItem;
  const clear = localStorage.clear;
  const removeItem = localStorage.removeItem;

  module.onUnload(() => {requirejs.onError = null});

  localStorage._resetValue = ()=>Object.create(null);
  Test.Core.onStart(() => {
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

  Test.Core.onTestStart(()=>{ls = localStorage._resetValue()});

  Test.Core.onEnd(()=>{
    ls = null;
    localStorage.setItem = setItem;
    localStorage.getItem = getItem;
    localStorage.removeItem = removeItem;
    localStorage.clear = clear;
  });

  Test.testHandle('A');

  session.connect();

  return Test;
});
