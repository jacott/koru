isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test-helper');
  var userAccount = require('./client-main');
  var session = require('../session/main');
  var localStorage = require('../local-storage');
  var SRP = require('../srp/srp');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.handle = userAccount.onChange(v.onChange = test.stub());
      test.stub(session, 'rpc');
    },

    tearDown: function () {
      v.handle.stop();
      v = null;
      userAccount.state = null;
    },

    "loginWithPassword": {
      setUp: function () {
        userAccount.loginWithPassword('foo@bar.co', 'secret', v.callback = test.stub());

        assert.calledWithExactly(
          session.rpc, 'SRPBegin',
          TH.match(function (request) {
            v.request = request;
            assert.same(request.email, 'foo@bar.co');
            return ('A' in request);

          }),
          TH.match(function (callback) {
            v.sutCallback = callback;
            return true;
          })
        );
      },

      "test success": function () {
        var verifier = SRP.generateVerifier('secret');
        var srp = new SRP.Server(verifier);
        var challenge = srp.issueChallenge({A: v.request.A});

        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(session.rpc, 'SRPLogin', TH.match(function (response) {
          if (response.M === srp.M) {
            session.rpc.yield(null, {
              userId: 'uid123',
              HAMK: srp.HAMK,
            });
            return true;
          }
        }));


        assert.calledWithExactly(v.callback);
      },

      "test failure": function () {
        var verifier = SRP.generateVerifier('bad');
        var srp = new SRP.Server(verifier);
        var challenge = srp.issueChallenge({A: v.request.A});

        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(session.rpc, 'SRPLogin', TH.match(function (response) {
          session.rpc.yield(null, {
            userId: 'uid123',
            HAMK: srp.HAMK,
          });
          return true;
        }));

        assert.calledWithExactly(v.callback, 'failure');
      },
    },

    "test changePassword": function () {
      test.stub(session, 'send');
      userAccount.changePassword('oldpw', 'newpw', v.callback = test.stub());

      assert.calledWith(session.send, 'VC', 'oldpw\nnewpw');

      assert.same(userAccount._changePasswordCallback, v.callback);

      session._onMessage({}, 'VCS');

      assert.calledWith(v.callback, null);
    },

    "test failed changePassword": function () {
      userAccount.changePassword('oldpw', 'newpw', v.callback = test.stub());
      session._onMessage({}, 'VCF');

      assert.calledWith(v.callback, 'failure');
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
