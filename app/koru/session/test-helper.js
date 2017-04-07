define(function(require, exports, module) {
  const koru    = require('../main');
  const session = require('../session/base');
  const TH      = require('../test-helper');

  const {geddon} = TH;

  return TH.util.protoCopy(TH, {
    sessionConnect(ws) {
      session.onConnection(ws);
      return session.conns[session._sessCounter.toString(36)];
    },

    mockWs() {
      const {test} = geddon;
      return {
        upgradeReq: {socket: {}, headers: {}},
        on: test.stub(),
        send: test.stub(),
        close: test.stub(),
      };
    },

    mockConnectState(v, state) {
      const {test} = geddon;
      state = state || session.state;
      test.stub(state, 'onConnect');
      test.stub(state, 'connected');
      test.stub(state, 'close');
      test.stub(state, 'retry');
      test.stub(state, 'isReady', () => v.ready);
    },
  });
});
