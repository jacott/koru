define(function(require, exports, module) {
  const util            = require('koru/util');
  const session         = require('../session/main');
  const message         = require('../session/message');
  const TH              = require('./main');
  const Future          = requirejs.nodeRequire('fibers/future');

  const {Core} = TH;
  let clientMessage, cmFuture;

  session.provide('i', data =>{
    clientMessage = data;
    cmFuture && cmFuture.return('');
  });

  TH = util.reverseMerge({
    cleanup() {
      clientMessage = null;
    },
    startClient(v, module) {
      for (const key in session.conns) {
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
            Core.fail(cm[1]);

          if (func) {
            var response = func.apply(this, cm[1]);

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
