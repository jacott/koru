define(function(require, exports, module) {
  const session = require('koru/session/base');
  const util    = require('koru/util');
  const koru    = require('../main');
  const TH      = require('../test-helper');
  const Query   = require('./query');

  const testCase = TH.testCase;
  let _sendM;

  return TH.util.protoCopy(TH, {
    testCase(...args) {
      const tc = testCase.apply(TH, args);
      tc.before(stubSendM);
      tc.after(unstubSendM);
      return tc;
    },

    matchModel(expect) {
      return TH.match(function (actual) {
        if (expect === actual) return true;
        if (expect && actual && expect.constructor === actual.constructor &&
            expect._id === actual._id) {
          return TH.geddon._u.deepEqual(actual.attributes, expect.attributes);
        }
      }, {toString() {return util.inspect(expect)}});
    },
  });

  function stubSendM() {
    _sendM = session._sendM;
    if (_sendM) {
      session._sendM = koru.nullFunc;
    }
  }

  function unstubSendM() {
    if (_sendM) {
      session.state._resetPendingCount();
      Query.revertSimChanges();
      session._sendM = _sendM;
      _sendM = null;
    }
  }
});
