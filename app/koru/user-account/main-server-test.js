isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../session/test-helper');
  var session = require('../session/base');
  var userAccount = require('./main');
  var Model = require('../model/main');
  var koru = require('../main');
  var SRP = require('../srp/srp');
  var Email = require('../email');
  var Val = require('../model/validation');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.ws = TH.mockWs();
      test.stub(koru, 'info');
      v.conn = TH.sessionConnect(v.ws);
      v.lu = userAccount.model.create({
        userId: 'uid111', srp: SRP.generateVerifier('secret'), email: 'foo@bar.co',
        tokens: {abc: Date.now()+24*1000*60*60, exp: Date.now()}});

      test.spy(Val, 'permitParams');
      test.spy(Val, 'ensureString');
    },

    tearDown: function () {
      test.stub(koru, 'logger');
      v.conn.close();
      koru.logger.restore();
      Model.UserLogin.docs.remove({});
      v = null;
    },

    "sendResetPasswordEmail": {
      setUp: function () {
        test.stub(Email, 'send');
        v.emailConfig = userAccount.emailConfig;
        userAccount.emailConfig = {
          sendResetPasswordEmailText: function (userId, token) {
            return "userid: " + userId + " token: " + token;
          },

          from: 'Koru <koru@obeya.co>',
          siteName: 'Koru',
        };
      },

      tearDown: function () {
        userAccount.emailConfig = v.emailConfig;
      },

      "test send": function () {
        userAccount.sendResetPasswordEmail('uid111');

        var tokenExp =  v.lu.$reload().resetTokenExpire;

        assert.between(tokenExp, Date.now() + 23*60*60*1000 , Date.now() + 25*60*60*1000);

        assert.calledWith(Email.send, {
          from: 'Koru <koru@obeya.co>',
          to: 'foo@bar.co',
          subject: 'How to reset your password on Koru',
          text: 'userid: uid111 token: ' + v.lu._id+'_'+v.lu.resetToken,
        });
      },
    },

    "test createUserLogin": function () {
      var spy = test.spy(SRP, 'generateVerifier');
      var lu = userAccount.createUserLogin({email: 'alice@obeya.co', userId: "uid1", password: 'test pw'});

      assert.calledWith(spy, 'test pw');

      assert.equals(lu.$reload().srp, spy.returnValues[0]);
      assert.same(lu.email, 'alice@obeya.co');
      assert.same(lu.userId, 'uid1');
      assert.equals(lu.tokens, {});
    },

    "test too many unexpiredTokens": function () {
      var tokens = v.lu.tokens = {};
      for(var i = 0; i < 15; ++i) {
        tokens['t'+i] = Date.now()+ (20-i)*24*1000*60*60;
      }
      assert.same(Object.keys(v.lu.unexpiredTokens()).sort().join(' '), 't0 t1 t2 t3 t4 t5 t6 t7 t8 t9');
    },

    "test expired tokens": function () {
      var tokens = v.lu.tokens = {};
      for(var i = 0; i < 5; ++i) {
        tokens['t'+i] = Date.now()+ (20-i)*24*1000*60*60;
      }

      for(var i = 0; i < 5; ++i) {
        tokens['e'+i] = Date.now() + (0-i)*24*1000*60*60;
      }

      assert.same(Object.keys(v.lu.unexpiredTokens()).sort().join(' '), 't0 t1 t2 t3 t4');
    },

    "loginWithPassword": {
      setUp: function () {
        v.srp = new SRP.Client('secret');
        v.request = v.srp.startExchange();
        v.request.email = 'foo@bar.co';
      },

      "test success": function () {
        var result = session._rpcs.SRPBegin.call(v.conn, v.request);

        var response = v.srp.respondToChallenge(result);

        assert.same(v.conn.userId, undefined);

        result = session._rpcs.SRPLogin.call(v.conn, response);

        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));
        assert.same(result.userId, 'uid111');
        var tparts = result.loginToken.split('|');
        assert.same(v.lu._id, tparts[0]);
        assert.equals(Object.keys(v.lu.$reload().tokens).sort(), ['abc', tparts[1]].sort());
        assert(v.ts = v.lu.tokens[tparts[1]]);
        assert.between(v.ts, Date.now()+179*24*1000*60*60, Date.now()+181*24*1000*60*60);
        assert.same(v.conn.userId, 'uid111');
      },

      "test wrong password": function () {
        v.lu.$update({srp: 'wrong'});
        var result = session._rpcs.SRPBegin.call(v.conn, v.request);

        var response = v.srp.respondToChallenge(result);

        assert.exception(function () {
          session._rpcs.SRPLogin.call(v.conn, response);
        }, {error: 403, reason: 'failure'});

        assert.same(v.conn.userId, undefined);
      },

      "test wrong email": function () {
        v.lu.$update({email: 'bad@bar.co'});
        assert.exception(function () {
          session._rpcs.SRPBegin.call(v.conn, v.request);
        }, {error: 403, reason: 'failure'});
      },
    },

    "resetPassword": {
      "test invalid resetToken": function () {
        assert.exception(function () {
          session._rpcs.resetPassword.call(v.conn, 'token', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});

        assert.exception(function () {
          session._rpcs.resetPassword.call(v.conn, v.lu._id+'_badtoken', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});
      },

      "test expired token": function () {
        v.lu.resetToken = 'secretToken';
        v.lu.resetTokenExpire = Date.now() -5;
        v.lu.$$save();

        assert.exception(function () {
          session._rpcs.resetPassword.call(v.conn, v.lu._id+'_secretToken', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});
      },

      "test success": function () {
        v.lu.resetToken = 'secretToken';
        v.lu.resetTokenExpire = Date.now() + 2000;
        v.lu.$$save();
        session._rpcs.resetPassword.call(v.conn, v.lu._id+'_secretToken', {identity: 'abc123'});

        assert.calledWith(Val.ensureString, v.lu._id+'_secretToken');
        assert.calledWith(Val.permitParams, {identity: 'abc123'}, { identity: true, salt: true, verifier: true });
        assert.same(v.conn.userId, v.lu.userId);
        v.lu.$reload();
        assert.equals(v.lu.srp, {identity: 'abc123'});
      },
    },

    "changePassword": {
      setUp: function () {
        v.srp = new SRP.Client('secret');
        v.request = v.srp.startExchange();
        v.request.email = 'foo@bar.co';
      },

      "test success": function () {
        var result = session._rpcs.SRPBegin.call(v.conn, v.request);

        var response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');
        result = session._rpcs.SRPChangePassword.call(v.conn, response);

        assert.calledWith(Val.permitParams, response.newPassword, { identity: true, salt: true, verifier: true });

        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));

        v.lu.$reload();
        assert.equals(response.newPassword, v.lu.srp);
      },

      "test wrong password": function () {
        v.lu.$update({srp: 'wrong'});
        var result = session._rpcs.SRPBegin.call(v.conn, v.request);

        var response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');

        assert.exception(function () {
          session._rpcs.SRPChangePassword.call(v.conn, response);
        });

        assert.same('wrong', v.lu.$reload().srp);
      },

      "test bad newPassword": function () {
        var result = session._rpcs.SRPBegin.call(v.conn, v.request);

        var response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');
        response.newPassword.bad = true;

        assert.accessDenied(function () {
          session._rpcs.SRPChangePassword.call(v.conn, response);
        });

        assert(SRP.checkPassword('secret', v.lu.$reload().srp));
      },
    },

    "login with token": {
      tearDown: function () {
        test.stub(koru, 'logger');
        v.conn2 && v.conn2.close();
        v.conn3 && v.conn3.close();
        v.connOther && v.connOther.close();
        koru.logger.restore();
      },

      "test logout": function () {
        v.conn.userId = 'uid222';

        session._commands.V.call(v.conn, 'X');

        assert.same(v.conn.userId, null);

        assert.calledWith(v.ws.send, 'VS');
      },

      "test logoutOtherClients": function () {
        v.ws2 = TH.mockWs();
        v.ws3 = TH.mockWs();
        v.ws4 = TH.mockWs();

        v.conn2 = TH.sessionConnect(v.ws2);
        v.conn3 = TH.sessionConnect(v.ws3);
        v.connOther = TH.sessionConnect(v.ws4);

        v.conn.userId = 'uid111';
        v.conn2.userId = 'uid111';
        v.conn3.userId = 'uid111';
        v.connOther.userId = 'uid444';

        session._commands.V.call(v.conn, 'O');

        assert.same(v.conn.userId, 'uid111');
        assert.same(v.conn2.userId, null);
        assert.same(v.conn3.userId, null);
        assert.same(v.connOther.userId, 'uid444');

        assert.calledWith(v.ws2.send, 'VS');
        assert.calledWith(v.ws3.send, 'VS');
        refute.calledWith(v.ws4.send, 'VS');
      },

      "test when not logged in logoutOtherClients does nothing": function () {
        v.ws2 = TH.mockWs();
        v.conn2 = TH.sessionConnect(v.ws2);
        v.conn2.userId = 'uid111';

        session._commands.V.call(v.conn, 'O');

        assert.same(v.conn2.userId, 'uid111');

        refute.calledWith(v.ws2.send, 'VS');
      },

      "test valid session login": function () {
        session._commands.V.call(v.conn, 'L'+v.lu._id+'|abc');

        assert.same(v.conn.userId, 'uid111');

        assert.calledWith(v.ws.send, 'VSuid111');
      },

      "test invalid session login": function () {
        session._commands.V.call(v.conn, 'L'+v.lu._id+'|abcd');

        assert.same(v.conn.userId, undefined);

        assert.calledWith(v.ws.send, 'VF');
      },

      "test invalid userId": function () {
        session._commands.V.call(v.conn, 'L1122|abc');

        assert.same(v.conn.userId, undefined);

        assert.calledWith(v.ws.send, 'VF');
      },
    },
  });
});
