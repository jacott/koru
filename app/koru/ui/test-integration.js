define(function(require, exports, module) {
  var util = require('koru/util');
  var session = require('../session');
  var message = require('../session/message');
  var Route = require('./route');

  var queueHead, queueTail;
  var serverMsg, syncMsg;

  var helper = {};

  function received(msg) {
    serverMsg = null;
    var actions = queueHead;
    queueHead = queueHead.next;
    if (! queueHead) queueTail = null;
    try {
      assert.same(msg[0], syncMsg);
      syncMsg = false;
      var nextMsg = actions.func.call(helper, msg[1], send);
      if (nextMsg !== undefined) send(nextMsg);
    } catch(ex) {
      handleError(ex);
    }

  }

  function send(msg, initial) {
    if (typeof msg === 'string')
      msg = [msg];
    assert.elideFromStack(Array.isArray(msg) && typeof msg[0] == 'string', "invalid server message");
    assert.elideFromStack.msg('may only send one wait message to server').isFalse(syncMsg);
    syncMsg = msg[0];
    session.sendBinary('i', ['ok', msg]);

    initial || queueHead ||
      exitScript();
  }

  session.provide('i', function (data) {
    data = message.decodeMessage(data);
    if (queueHead)
      received(data);
    else
      serverMsg = data;
  });

  function Client(func) {
    var actions = {};
    syncMsg = false;
    queueHead = queueTail = null;
    exits = [];

    function script(firstMsg) {
      send(util.slice(arguments), 'initial');
      var sp = {
        then: function (func) {
          var entry = {func: func};
          if (queueTail)
            queueTail.next = entry;
          else
            queueHead = entry;
          queueTail = entry;

          return this;
        },
      };

      return sp;
    }


    script.onExit = function (func) {
      exits.push(func);
    };

    script.waitForPage = function (page, func) {
      if (Route.currentPage === page)
        return func(page, Route.currentHref);
      pageWait = page;
      pageWaitFunc = func;
      return 'waiting';
    };

    var pageWait, pageWaitFunc;
    script.onExit(Route.onChange(function (page, href) {
      if (pageWait && page === pageWait) {
        var func = pageWaitFunc;
        pageWaitFunc = pageWait = null;
        func(page, href);
      }
    }));

    try {
      func(script);
      serverMsg && received(serverMsg);
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
