isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test-helper');
  var userAccount = require('./main');
  var session = require('../session/base');
  var localStorage = require('../local-storage');
  var SRP = require('../srp/srp');
  var util = require('../util');
  var env = require('../env');
  var login = require('./client-login');
  var sessState = require('../session/state');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.oldUserId = util.thread.userId;
      v.handle = login.onChange(v.onChange = test.stub());
      test.stub(session, 'rpc');
    },

    tearDown: function () {
      util.thread.userId = v.oldUserId;
      v.handle && v.handle.stop();
      v = null;
      login.state = null;
    },

    "changePassword": {
      setUp: function () {
        userAccount.changePassword('foo@bar.co', 'secret', 'new pw', v.callback = test.stub());

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

        assert.calledWith(session.rpc, 'SRPChangePassword', TH.match(function (response) {
          assert(SRP.checkPassword('new pw', response.newPassword));
          if (response.M === srp.M) {
            session.rpc.yield(null, {
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

        assert.calledWith(session.rpc, 'SRPChangePassword', TH.match(function (response) {
          session.rpc.yield(null, {
            HAMK: srp.HAMK,
          });
          return true;
        }));

        assert.calledWithExactly(v.callback, 'failure');
      },
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
              loginToken: 'tokenId|token123',
            });
            return true;
          }
        }));


        assert.calledWithExactly(v.callback);
        assert.same(util.thread.userId, 'uid123');
        assert.same(localStorage.getItem('koru.loginToken'), 'tokenId|token123');
      },

      "test bad username": function () {
        v.sutCallback('Xfailure');

        assert.calledWith(v.callback, 'Xfailure');

        refute.calledWith(session.rpc, 'SRPLogin');
      },

      "test bad password": function () {
        var orig = util.thread.userId;
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
        assert.same(util.thread.userId, orig);
      },

      "test bad final response": function () {
        var orig = util.thread.userId;
        var verifier = SRP.generateVerifier('secret');
        var srp = new SRP.Server(verifier);
        var challenge = srp.issueChallenge({A: v.request.A});

        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(session.rpc, 'SRPLogin', TH.match(function (response) {
          return response.M === srp.M;
        }));
        session.rpc.yield('failure');

        assert.calledWithExactly(v.callback, 'failure');
      },
    },

    "token login/logout": {
      setUp: function () {
        test.stub(session, 'send');
        userAccount.init();
      },

      tearDown: function () {
        userAccount.stop();

      },

      "test resetPassword": function () {
        userAccount.resetPassword('the key', 'new password', v.callback = test.stub());
        assert.calledWith(session.rpc, 'resetPassword', 'the key', TH.match(function (hash) {
          return SRP.checkPassword('new password', hash);
        }), v.callback);
      },

      "test logout": function () {
        util.thread.userId = 'userId456';

        userAccount.logout();
        assert.calledWith(session.send, 'VX');

        session._onMessage({}, 'VS');

        assert.same(env.userId(), null);
      },

      "test logoutOtherClients": function () {
        userAccount.logoutOtherClients();
        assert.calledWith(session.send, 'VO');
      },

      "test sending login token": function () {
        assert.isTrue(sessState._onConnect['01'].indexOf(userAccount._onConnect) !== -1);

        assert.same(login.state, null);

        userAccount._onConnect();
        refute.calledWith(session.send, 'VL');

        assert.same(login.state, null);


        localStorage.setItem('koru.loginToken', 'tokenId|token123');
        userAccount._onConnect();

        assert.same(login.state, 'wait');

        assert.calledWith(v.onChange, 'wait');
        assert.calledWith(session.send, 'VL', 'tokenId|token123');

        session._onMessage({}, 'VSuid123');

        assert.same(login.state, 'change');
        assert.calledWith(v.onChange, 'change');

        assert.same(env.userId(), 'uid123');


        session._onMessage({}, 'VC');

        assert.same(login.state, 'ready');
        assert.calledWith(v.onChange, 'ready');
      },

      "test login failure": function () {
        localStorage.setItem('koru.loginToken', 'tokenId|token123');
        userAccount._onConnect();

        session._onMessage({}, 'VF');

        assert.same(login.state, 'failure');
        assert.calledWith(v.onChange, 'failure');
      },
    },
  });
});
