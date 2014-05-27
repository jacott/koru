define(function(require, exports, module) {
  var TH = require('../test-helper');
  var session = require('../session/main');
  var env = require('../env');

  var testCase = TH.testCase;
  var sendM;
  var geddon = TH.geddon;

  return TH.util.reverseExtend({
    sessionConnect: function (ws) {
      session._onConnection(ws);

      var key = session._sessCounter.toString(16);
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
  }, TH);
});
