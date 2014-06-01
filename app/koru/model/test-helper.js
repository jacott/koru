define(function(require, exports, module) {
  var TH = require('../test-helper');
  var session = require('../session/main');
  var env = require('../env');

  var testCase = TH.testCase;
  var sendM;

  return TH.util.reverseExtend({
    testCase: function () {
      var tc = testCase.apply(TH, arguments);
      tc.onStartTestCase(stubSendM);
      tc.onEndTestCase(unstubSendM);
      return tc;
    },

    matchModel: function (expect) {
      return TH.match(function (actual) {
        if (expect === actual) return true;
        if (expect && actual && expect.constructor === actual.constructor &&
            expect._id === actual._id) {
          assert.equals(actual.attributes, expect.attributes);
          return true;
        }
      });
    },
  }, TH);

  function stubSendM() {
    if (session.hasOwnProperty('sendM')) {
      sendM = session.sendM;
      session.sendM = env.nullFunc;
    }
  }

  function unstubSendM() {
    if (sendM) {
      session.sendM = sendM;
      sendM = null;
    }
  }
});
