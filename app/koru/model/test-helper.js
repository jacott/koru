define((require, exports, module)=>{
  const session         = require('koru/session/base');
  const koru            = require('../main');
  const TH              = require('../test-helper');
  const Query           = require('./query');

  const {deepEqual} = TH.Core.util;

  const {testCase, util} = TH;
  let _sendM;

  const stubSendM = ()=>{
    _sendM = session._sendM;
    if (_sendM) {
      session._sendM = koru.nullFunc;
    }
  };

  const unstubSendM = ()=>{
    if (_sendM) {
      session.state._resetPendingCount();
      Query.revertSimChanges();
      session._sendM = _sendM;
      _sendM = null;
    }
  };

  return util.protoCopy(TH, {
    testCase: (...args)=>{
      const tc = testCase.apply(TH, args);
      tc.before(stubSendM);
      tc.after(unstubSendM);
      return tc;
    },

    matchModel: expect => TH.match(actual =>{
      if (expect === actual) return true;
      if (expect && actual && expect.constructor === actual.constructor &&
          expect._id === actual._id) {
        return deepEqual(actual.attributes, expect.attributes);
      }
    }, {toString() {return util.inspect(expect)}}),
  });
});
