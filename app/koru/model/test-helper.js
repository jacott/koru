define(function(require, exports, module) {
  const session = require('koru/session/base');
  const koru    = require('../main');
  const TH      = require('../test-helper');
  const Query   = require('./query');

  const testCase = TH.testCase;
  let sendM;

  return TH.util.protoCopy(TH, {
    testCase: function () {
      var tc = testCase.apply(TH, arguments);
      tc.before(stubSendM);
      tc.after(unstubSendM);
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
  });

  function stubSendM() {
    if (session.hasOwnProperty('sendM')) {
      sendM = session.sendM;
      session.sendM = koru.nullFunc;
    }
  }

  function unstubSendM() {
    if (sendM) {
      session.state._resetPendingCount();
      Query.revertSimChanges();
      session.sendM = sendM;
      sendM = null;
    }
  }
});
