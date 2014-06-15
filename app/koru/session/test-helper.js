define(function(require, exports, module) {
  var TH = require('../test-helper');
  var session = require('../session/base');
  var env = require('../env');
  var connectState = require('./connect-state');

  var geddon = TH.geddon;

  return TH.util.reverseExtend({
    sessionConnect: function (ws) {
      session._onConnection(ws);

      var key = session._sessCounter.toString(36);
      return session.conns[key];
    },

    mockWs: function () {
      return {
        upgradeReq: {socket: {}, headers: {}},
        on: geddon.test.stub(),
        send: geddon.test.stub(),
        close: geddon.test.stub(),
      };
    },

    mockConnectState: function (v) {
      var test = geddon.test;
      test.stub(connectState, 'onConnect');
      test.stub(connectState, 'connected');
      test.stub(connectState, 'close');
      test.stub(connectState, 'retry');
      test.stub(connectState, 'isReady', function () {
        return v.ready;
      });
    },
  }, TH);
});
