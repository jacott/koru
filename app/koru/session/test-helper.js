define((require, exports, module)=>{
  'use strict';
  const util            = require('koru/util');
  const koru            = require('../main');
  const session         = require('../session/base');
  const BaseTH          = require('koru/model/test-helper');

  const {Core, stub} = BaseTH;

  return {
    __proto__: BaseTH,
    sessionConnect(ws) {
      session.onConnection(ws, ws[isTest].request);
      return session.conns[session._sessCounter.toString(36)];
    },

    mockWs() {
      return {
        [isTest]: {
          request: {connection: {}, headers: {}, url: `/ws/${koru.PROTOCOL_VERSION}/dev/`}
        },
        on: stub(),
        send: stub(),
        close: stub(),
      };
    },

    mockConnectState(v, state) {
      state = state || session.state;
      stub(state, 'onConnect');
      stub(state, 'connected');
      stub(state, 'close');
      stub(state, 'retry');
      stub(state, 'isReady', () => v.ready);
    },
  };
});
