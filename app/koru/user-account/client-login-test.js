define((require, exports, module)=>{
  const Session         = require('koru/session').constructor;
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd, util} = TH;

  const ClientLogin = require('./client-login');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("setUserId", ()=>{
      const session = new Session('test');
      const oc = stub();
      onEnd(()=>{
        util.thread.userId = void 0;
      });
      onEnd(ClientLogin.onChange(session, oc));

      session.DEFAULT_USER_ID = 'public';
      ClientLogin.setUserId(session, null);

      assert.calledWith(oc, 'change');
      assert.same(util.thread.userId, 'public');

      ClientLogin.setUserId(session, 'u123');
      assert.same(util.thread.userId, 'u123');

      ClientLogin.setUserId(session, void 0);
      assert.same(util.thread.userId, 'public');
    });
  });
});
