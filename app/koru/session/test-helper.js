define(function(require, exports, module) {
  const util            = require('koru/util');
  const koru            = require('../main');
  const session         = require('../session/base');
  const TH              = require('../test-helper');

  const {test$} = require('koru/symbols');

  const {Core, stub} = TH;

  return util.protoCopy(TH, {
    sessionConnect(ws) {
      session.onConnection(ws, ws[test$].request);
      return session.conns[session._sessCounter.toString(36)];
    },

    mockWs() {
      return {
        [test$]: {
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
  });
});
