define(function(require, exports, module) {
  var util = require('koru/util');
  var session = require('../session');
  var message = require('../session/message');
  var Route = require('./route');

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
    _koru_.debug('XX');

    util.forEach(exits, function (exit) {
      exit.stop ? exit.stop() : exit();
    });
    if (ex) throw ex;
  }

  return Client;
});
