define((require) => {
  'use strict';
  const util            = require('koru/util');
  const BaseTH          = require('./main');
  const session         = require('../session/main');
  const message         = require('../session/message');

  const {Core} = BaseTH;
  let clientMessage, cmFuture;

  session.provide('i', (data) => {
    clientMessage = data;
    cmFuture && cmFuture.return('');
  });

  return {
    __proto__: BaseTH,

    cleanup() {
      clientMessage = null;
    },
    startClient(v, module) {
      for (const key in session.conns) {
        v.conn = session.conns[key];
        break;
      }
      assert(v.conn, 'should start client first');
      v.script = {
        wait(when, func) {
          if (! clientMessage) {
            cmFuture = new util.Future();
            cmFuture.wait();
          }
          const cm = clientMessage;
          clientMessage = null;
          if (cm[0] === 'ok') {
            assert.elide(() => {assert.same(cm[1][0], when)});
          } else {
            assert.fail(cm[1], 1);
          }

          if (func) {
            const response = func.apply(this, cm[1]);

            v.conn.sendBinary('i', [when, response]);
          }
          return this;
        },
      };

      module = 'integration-tests/' + module;
      session.unload(module);
      session.load(module);
    },
  };
});
