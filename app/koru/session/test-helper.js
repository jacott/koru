define(function(require, exports, module) {
  var TH = require('../test-helper');
  var session = require('../session/base');
  var koru = require('../main');

  var geddon = TH.geddon;

  return TH.util.protoCopy(TH, {
    sessionConnect: function (ws) {
      session.onConnection(ws);

      var key = session._sessCounter.toString(36);
      return session.conns[key];
    },

    mockWs: function () {
      var test = geddon.test;
      return {
        upgradeReq: {socket: {}, headers: {}},
        on: test.stub(),
        send: test.stub(),
        close: test.stub(),
      };
    },

    mockConnectState: function (v, state) {
      var test = geddon.test;
      state = state || session.state;
      test.stub(state, 'onConnect');
      test.stub(state, 'connected');
      test.stub(state, 'close');
      test.stub(state, 'retry');
      test.stub(state, 'isReady', function () {
        return v.ready;
      });
    },
  });
});
