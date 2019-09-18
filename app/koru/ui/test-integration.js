define((require)=>{
  'use strict';
  const koru            = require('koru');
  const util            = require('koru/util');
  const Dom             = require('../dom');
  const session         = require('../session');
  const message         = require('../session/message');
  const Route           = require('./route');

  let queueHead, queueTail;
  let syncMsg;
  let exits;

  const helper = {};

  const handleError = ex =>{
    session.sendBinary('i', ['error', util.extractError(ex)]);
    exitScript(ex);
  };

  const exitScript = ex =>{
    for (const exit of exits) {
      exit.stop ? exit.stop() : exit();
    }
    if (ex) throw ex;
  };

  const send = msg =>{
    if (typeof msg === 'string')
      msg = [msg];
    assert.elide(()=>{
      assert(Array.isArray(msg) && typeof msg[0] == 'string', "invalid server message");
      assert.msg('may only send one wait message to server').isFalse(syncMsg);
    });
    syncMsg = msg[0];
    session.sendBinary('i', ['ok', msg]);

    queueHead || exitScript();
  };

  session.provide('i', data =>{
    queueHead ||
      handleError(new Error('unexpected server message: ' + util.inpect(data)));

    const actions = queueHead;
    queueHead = queueHead.next;
    if (queueHead === null) queueTail = null;
    syncMsg = false;
    actions.func.call(helper, data);
  });

  const Client = async func =>{
    const actions = {};
    syncMsg = false;
    queueHead = queueTail = null;
    exits = [];

    const script = {
      waitForClassChange: (elm, classname, hasClass, duration)=> new Promise((resolve, reject)=>{
        if (typeof elm === 'string')
          elm = document.querySelector(elm);
        duration = duration || 2000;
          var observer = new window.MutationObserver(mutations =>{
            if (Dom.hasClass(elm, classname) === hasClass) {
              observer.disconnect();
              koru.clearTimeout(timeout);
              resolve(elm, classname, ! hasClass);
            }
          });
          observer.observe(elm, {attributes: true});
          var timeout = koru.setTimeout(()=>{
            observer.disconnect();
            reject(new Error('Timed out waiting for element to change' + util.inspect(elm)));
          }, duration);
      }),

      tellServer: (...args)=> new Promise((resolve, reject)=>{
        const msg = args[0];
        const entry = {
          func(data) {
            try {
              if (data[0] === msg)
                resolve(data[1]);
              else
                reject('unexpect server message: '+data[0]);
            } catch(ex) {
              reject(ex);
            }
          },
          next: null,
        };
        if (queueTail !== null)
          queueTail.next = entry;
        else
          queueHead = entry;
        queueTail = entry;

        send(args);
      }),

      onExit: func =>{exits.push(func)},
    };

    try {
      await func(script);
    } catch(ex) {
      handleError(ex);
    }
  };

  return Client;
});
