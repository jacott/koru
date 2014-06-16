define(function(require, exports, module) {
  var koru = require('../main');
  var TH = require('../test-helper');
  var session = require('../session/base');
  var sessState = require('../session/state');
  var Query = require('./query');

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
          return TH.geddon._u.deepEqual(actual.attributes, expect.attributes);
        }
      });
    },
  }, TH);

  function stubSendM() {
    if (session.hasOwnProperty('sendM')) {
      sendM = session.sendM;
      session.sendM = koru.nullFunc;
    }
  }

  function unstubSendM() {
    if (sendM) {
      sessState._resetPendingCount();
      Query.revertSimChanges();
      session.sendM = sendM;
      sendM = null;
    }
  }
});
