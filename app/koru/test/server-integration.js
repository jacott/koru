define(function(require, exports, module) {
  var util = require('koru/util');
  var TH = require('./main');
  var session = require('../session/main');
  var message = require('../session/message');
  var Future = requirejs.nodeRequire('fibers/future');

  var geddon = TH.geddon;
  var clientMessage, cmFuture;

  session.provide('i', function (data) {
    data = message.decodeMessage(data);
    clientMessage = data;
    cmFuture && cmFuture.return('');
  });

  TH = util.reverseExtend({
    cleanup: function () {
      clientMessage = null;
    },
    startClient: function (v, module) {
      for (var key in session.conns) {
        v.conn = session.conns[key];
        break;
      }
      assert(v.conn, "should start client first");
      v.script = {
        wait:   function waitClient(when, func) {
          if (! clientMessage) {
            cmFuture = new Future;
            cmFuture.wait();
          }
          var cm = clientMessage;
          clientMessage = null;
          if (cm[0] === 'ok')
            assert.elideFromStack.same(cm[1][0], when);
          else
            geddon.fail(cm[1]);

          if (func) {
            var response = func();

            v.conn.sendBinary('i', [when, response]);
          }
          return this;
        },
      };

      module = 'integration-tests/'+module;
      session.unload(module);
      session.load(module);
    },

  }, TH);

  return TH;
});
