define(function(require, exports, module) {
  var TH = require('../test-helper');
  var session = require('../session/base');
  var koru = require('../main');
  var sessState = require('./state');

  var geddon = TH.geddon;

  return TH.util.reverseExtend({
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

    mockConnectState: function (v) {
      var test = geddon.test;
      test.stub(sessState, 'onConnect');
      test.stub(sessState, 'connected');
      test.stub(sessState, 'close');
      test.stub(sessState, 'retry');
      test.stub(sessState, 'isReady', function () {
        return v.ready;
      });
    },
  }, TH);
});
