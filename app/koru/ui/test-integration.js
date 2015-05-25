define(function(require, exports, module) {
  var util = require('koru/util');
  var session = require('../session');
  var message = require('../session/message');
  var Route = require('./route');
  var Dom = require('../dom');
  var koru = require('koru');

  var queueHead, queueTail;
  var syncMsg;

  var helper = {};

  function send(msg) {
    if (typeof msg === 'string')
      msg = [msg];
    assert.elideFromStack(Array.isArray(msg) && typeof msg[0] == 'string', "invalid server message");
    assert.elideFromStack.msg('may only send one wait message to server').isFalse(syncMsg);
    syncMsg = msg[0];
    session.sendBinary('i', ['ok', msg]);

    queueHead || exitScript();
  }

  session.provide('i', function (data) {
    data = message.decodeMessage(data);
    queueHead ||
      handleError(new Error('unexpected server message: ' + util.inpect(data)));

    var actions = queueHead;
    queueHead = queueHead.next;
    if (! queueHead) queueTail = null;
    syncMsg = false;
    actions.func.call(helper, data);
  });

  function Client(func) {
    var actions = {};
    syncMsg = false;
    queueHead = queueTail = null;
    exits = [];

    var script = {
      waitForClassChange: function (elm, classname, hasClass, duration) {
        if (typeof elm === 'string')
          elm = document.querySelector(elm);
        duration = duration || 2000;
        return new Promise(function (resolve, reject) {
          var observer = new window.MutationObserver(function (mutations) {
            if (Dom.hasClass(elm, classname) === hasClass) {
              observer.disconnect();
              koru.clearTimeout(timeout);
              resolve(elm, classname, ! hasClass);
            }
          });
          observer.observe(elm, {attributes: true});
          var timeout = koru.setTimeout(function () {
            observer.disconnect();
            reject(new Error('Timed out waiting for element to change' + util.inspect(elm)));
          }, duration);
        });
      },
      tellServer: function (msg) {
          return new Promise(function (resolve, reject) {
            var entry = {func: function (data) {
              try {
                if (data[0] === msg)
                  resolve(data[1]);
                else
                  reject('unexpect server message: '+data[0]);
              } catch(ex) {
                reject(ex);
              }
            }};
            if (queueTail)
              queueTail.next = entry;
            else
              queueHead = entry;
            queueTail = entry;

            send(msg);
          });
        },

      onExit: function (func) {
        exits.push(func);
      },
    };


    try {
      var promise = func(script);
      if (promise.then)
        promise.then(null, handleError);
    } catch(ex) {
      handleError(ex);
    }
  }

  function handleError(ex) {
    session.sendBinary('i', ['error', util.extractError(ex)]);
    exitScript(ex);
  }

  var exits;

  function exitScript(ex) {
    util.forEach(exits, function (exit) {
      exit.stop ? exit.stop() : exit();
    });
    if (ex) throw ex;
  }

  return Client;
});
