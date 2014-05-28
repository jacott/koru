isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test-helper');
  var userAccount = require('./client-main');
  var session = require('../session/main');
  var localStorage = require('../local-storage');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.handle = userAccount.onChange(v.onChange = test.stub());
    },

    tearDown: function () {
      v.handle.stop();
      v = null;
      userAccount.state = null;
    },

    "test sending login token": function () {
      test.stub(session, 'send');
      assert.isTrue(session._onConnect.indexOf(userAccount._onConnect) !== -1);

      assert.same(userAccount.state, null);

      userAccount._onConnect();
      refute.calledWith(session.send, 'VL');

      assert.same(userAccount.state, null);


      localStorage.setItem('koru.loginToken', 'tokenId|token123');
      userAccount._onConnect();

      assert.same(userAccount.state, 'wait');

      assert.calledWith(v.onChange, 'wait');
      assert.calledWith(session.send, 'VL', 'tokenId|token123');

      session._onMessage({}, 'VS');

      assert.same(userAccount.state, 'success');
      assert.calledWith(v.onChange, 'success');
    },

    "test login failure": function () {
      localStorage.setItem('koru.loginToken', 'tokenId|token123');
      userAccount._onConnect();

      session._onMessage({}, 'VF');

      assert.same(userAccount.state, 'failure');
      assert.calledWith(v.onChange, 'failure');
    },
  });
});
