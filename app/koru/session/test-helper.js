define(function(require, exports, module) {
  const koru    = require('../main');
  const session = require('../session/base');
  const TH      = require('../test-helper');

  const {Core, stub, util} = TH;

  return util.protoCopy(TH, {
    sessionConnect(ws) {
      session.onConnection(ws, ws._upgradeReq);
      return session.conns[session._sessCounter.toString(36)];
    },

    mockWs() {
      return {
        _upgradeReq: {connection: {}, headers: {}, url: `/ws/${koru.PROTOCOL_VERSION}/dev/`},
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
