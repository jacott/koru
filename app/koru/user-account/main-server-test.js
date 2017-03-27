define(function (require, exports, module) {
  const Email       = require('koru/email');
  const koru        = require('koru/main');
  const Model       = require('koru/model/main');
  const Val         = require('koru/model/validation');
  const Random      = require('koru/random').global;
  const session     = require('koru/session');
  const TH          = require('koru/session/test-helper');
  const SRP         = require('koru/srp/srp');
  const crypto      = requirejs.nodeRequire('crypto');

  const userAccount = require('./main');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.ws = TH.mockWs();
      TH.noInfo();
      v.conn = TH.sessionConnect(v.ws);
      v.lu = userAccount.model.create({
        userId: 'uid111', srp: 'wrong', email: 'foo@bar.co',
        tokens: {abc: Date.now()+24*1000*60*60, exp: Date.now(), def: Date.now()+48*1000*60*60}});

      this.spy(Val, 'assertCheck');
      this.spy(Val, 'ensureString');
      this.stub(crypto, 'randomBytes', (num, cb) => {
        if (cb) {
          cb(null, {toString: this.stub().withArgs('base64').returns('crypto64Id')});
        } else
          return new Uint8Array(num);
      });
    },

    tearDown() {
      userAccount.model.docs.remove({});
      this.intercept(koru, 'logger');
      v.conn.close();
      koru.logger.restore();
      v = null;
    },

    "test makeResetPasswordKey"() {
      this.stub(Random, 'id')
        .onCall(0).returns('randid=')
        .onCall(1).returns('r2');

      const ans = userAccount.makeResetPasswordKey({_id: 'uid111'});
      assert.equals(ans.attributes, v.lu.$reload().attributes);

      assert.between(ans.resetTokenExpire, Date.now() + 23*60*60*1000 , Date.now() + 25*60*60*1000);
      assert.equals(ans.resetToken, 'randid=r2');
    },

    "sendResetPasswordEmail": {
      setUp() {
        this.stub(Email, 'send');
        v.userAccountConfig = koru.config.userAccount;
        koru.config.userAccount = {
          emailConfig: {
            sendResetPasswordEmailText(user, token) {
              return "userid: " + user._id + " token: " + token;
            },

            from: 'Koru <koru@vimaly.com>',
            siteName: 'Koru',
          },
        };
      },

      tearDown() {
        koru.config.userAccount = v.userAccountConfig;
      },

      "test send"() {
        userAccount.sendResetPasswordEmail({_id: 'uid111'});

        const tokenExp =  v.lu.$reload().resetTokenExpire;

        assert.between(tokenExp, Date.now() + 23*60*60*1000 , Date.now() + 25*60*60*1000);

        assert.calledWith(Email.send, {
          from: 'Koru <koru@vimaly.com>',
          to: 'foo@bar.co',
          subject: 'How to reset your password on Koru',
          text: 'userid: uid111 token: ' + v.lu._id+'-'+v.lu.resetToken,
        });
      },
    },

    "test UserLogin"() {
      assert.same(Model.UserLogin.modelName, "UserLogin");
    },

    "test createUserLogin"() {
      const spy = this.spy(SRP, 'generateVerifier');
      const lu = userAccount.createUserLogin({
        email: 'alice@vimaly.com', userId: "uid1", password: 'test pw'});

      assert.calledWith(spy, 'test pw');

      assert.equals(lu.$reload().srp, spy.firstCall.returnValue);
      assert.same(lu.email, 'alice@vimaly.com');
      assert.same(lu.userId, 'uid1');
      assert.equals(lu.tokens, {});
    },

    "test updateOrCreateUserLogin"() {
      let lu = userAccount.updateOrCreateUserLogin({
        email: 'alice@vimaly.com', userId: "uid1", srp: 'test srp'});

      assert.equals(lu.$reload().srp, 'test srp');
      assert.same(lu.email, 'alice@vimaly.com');
      assert.same(lu.userId, 'uid1');
      assert.equals(lu.tokens, {});

      lu = userAccount.updateOrCreateUserLogin({
        email: 'bob@vimaly.com', userId: "uid1", srp: 'new srp'});

      assert.equals(lu.$reload().srp, 'new srp');
      assert.same(lu.email, 'bob@vimaly.com');
      assert.same(lu.userId, 'uid1');

      lu = userAccount.updateOrCreateUserLogin({email: 'bob@vimaly.comm', userId: "uid1"});

      assert.equals(lu.$reload().srp, 'new srp');
      assert.same(lu.email, 'bob@vimaly.comm');
      assert.same(lu.userId, 'uid1');
    },

    "test too many unexpiredTokens"() {
      const tokens = v.lu.tokens = {};
      for(let i = 0; i < 15; ++i) {
        tokens['t'+i] = Date.now()+ (20-i)*24*1000*60*60;
      }
      assert.same(Object.keys(v.lu.unexpiredTokens()).sort().join(' '),
                  't0 t1 t2 t3 t4 t5 t6 t7 t8 t9');
    },

    "test expired tokens"() {
      const tokens = v.lu.tokens = {};
      for(let i = 0; i < 5; ++i) {
        tokens['t'+i] = Date.now()+ (20-i)*24*1000*60*60;
      }

      for(let i = 0; i < 5; ++i) {
        tokens['e'+i] = Date.now() + (0-i)*24*1000*60*60;
      }

      assert.same(Object.keys(v.lu.unexpiredTokens()).sort().join(' '),
                  't0 t1 t2 t3 t4');
    },

    "test verifyClearPassword"() {
      v.lu.$update('srp', SRP.generateVerifier('secret'));
      let docToken = userAccount.verifyClearPassword('foo@bar.co', 'secret');
      assert.equals(docToken && docToken[0]._id, v.lu._id);
      assert(userAccount.verifyToken('foo@bar.co', docToken[1]));
      docToken = userAccount.verifyClearPassword('foo@bar.co', 'secretx');
      assert.same(docToken, undefined);
    },

    "test verifyToken"() {
      let doc = userAccount.verifyToken('foo@bar.co', 'abc'); // by email and good token
      assert.equals(doc && doc._id, v.lu._id);
      doc = userAccount.verifyToken('foo@bar.co', 'exp'); // bad token
      assert.same(doc, undefined);
      doc = userAccount.verifyToken(v.lu._id, 'abc'); // by id and good token
      assert.equals(doc && doc._id, v.lu._id);
    },

    "loginWithPassword": {
      setUp() {
        v.srp = new SRP.Client('secret');
        v.request = v.srp.startExchange();
        v.request.email = 'foo@bar.co';
      },

      "test direct calling"() {
        v.lu.$update('srp', SRP.generateVerifier('secret'));
        const storage = {};
        let result = userAccount.SRPBegin(storage, v.request);

        assert.equals(storage, {
          $srp: TH.match.any, $srpUserAccount: TH.match.field('_id', v.lu._id)});
        const response = v.srp.respondToChallenge(result);
        result = userAccount.SRPLogin(storage, response);
        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));
        assert.same(result.userId, 'uid111');
      },

      "test success"() {
        v.lu.$update('srp', SRP.generateVerifier('secret'));
        let result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);

        assert.same(v.conn.userId, undefined);

        result = session._rpcs.SRPLogin.call(v.conn, response);

        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));
        assert.same(result.userId, 'uid111');
        const tparts = result.loginToken.split('|');
        assert.same(v.lu._id, tparts[0]);
        assert.equals(Object.keys(v.lu.$reload().tokens).sort(), ['abc', tparts[1], 'def'].sort());
        assert(v.ts = v.lu.tokens[tparts[1]]);
        assert.between(v.ts, Date.now()+179*24*1000*60*60, Date.now()+181*24*1000*60*60);
        assert.same(v.conn.userId, 'uid111');
      },

      "test wrong password"() {
        const result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);

        assert.exception(function () {
          session._rpcs.SRPLogin.call(v.conn, response);
        }, {error: 403, reason: 'failure'});

        assert.same(v.conn.userId, undefined);
      },

      "test wrong email"() {
        v.lu.$update({email: 'bad@bar.co'});
        assert.exception(function () {
          session._rpcs.SRPBegin.call(v.conn, v.request);
        }, {error: 403, reason: 'failure'});
      },
    },

    "resetPassword": {
      "test invalid resetToken"() {
        assert.exception(function () {
          session._rpcs.resetPassword.call(v.conn, 'token', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});

        assert.exception(function () {
          session._rpcs.resetPassword.call(v.conn, v.lu._id+'_badtoken', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});
      },

      "test expired token"() {
        assert.equals(userAccount.model.$fields.resetTokenExpire, {type: 'bigint'});

        v.lu.resetToken = 'secretToken';
        v.lu.resetTokenExpire = Date.now() -5;
        v.lu.$$save();

        assert.exception(function () {
          session._rpcs.resetPassword.call(v.conn, v.lu._id+'_secretToken', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});
      },

      "test success"() {
        this.spy(userAccount, 'resetPassword');
        v.lu.resetToken = 'secretToken';
        v.lu.resetTokenExpire = Date.now() + 2000;
        v.lu.$$save();
        session._rpcs.resetPassword.call(v.conn, v.lu._id+'-secretToken', {identity: 'abc123'});

        assert.calledWith(Val.ensureString, v.lu._id+'-secretToken');
        assert.calledWith(Val.assertCheck, {identity: 'abc123'}, {
          identity: 'string', salt: 'string', verifier: 'string' });

        assert.same(v.conn.userId, v.lu.userId);
        v.lu.$reload();
        assert.equals(v.lu.srp, {identity: 'abc123'});
        assert.calledWith(v.ws.send, TH.match(function (data) {
          if (typeof data !== 'string') return false;

          const m = data.match(/^VT(.*)\|(.*)$/);
          v.docId = m && m[1];
          return v.token = m && m[2];

        }));
        assert.same(v.lu._id, v.docId);
        assert.equals(userAccount.resetPassword.firstCall.returnValue, [
          TH.match.field('_id', v.lu._id), v.token]);
        assert.between(v.lu.tokens[v.token],
                       Date.now()+180*24*1000*60*60-1000, Date.now()+180*24*1000*60*60+1000);
        assert.same(v.lu.resetToken, undefined);
        assert.same(v.lu.resetTokenExpire, undefined);


        assert.calledWith(v.ws.send, matchStart('VS' + v.lu.userId));
      },
    },

    "changePassword": {
      setUp() {
        v.srp = new SRP.Client('secret');
        v.request = v.srp.startExchange();
        v.request.email = 'foo@bar.co';
      },

      "test intercept"() {
        this.onEnd(() => userAccount.interceptChangePassword = null);
        userAccount.interceptChangePassword = this.stub();

         v.lu.$update('srp', SRP.generateVerifier('secret'));
        let result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');
        result = session._rpcs.SRPChangePassword.call(v.conn, response);

        assert.calledWith(Val.assertCheck, response.newPassword, {identity: 'string', salt: 'string', verifier: 'string'});

        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));

        assert.calledWith(userAccount.interceptChangePassword, TH.match.field('_id', v.lu._id),
                          response.newPassword);

        v.lu.$reload();
        refute.equals(response.newPassword, v.lu.srp);
      },

      "test success"() {
        v.lu.$update('srp', SRP.generateVerifier('secret'));
        let result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');
        result = session._rpcs.SRPChangePassword.call(v.conn, response);

        assert.calledWith(Val.assertCheck, response.newPassword, {
          identity: 'string', salt: 'string', verifier: 'string'});

        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));

        v.lu.$reload();
        assert.equals(response.newPassword, v.lu.srp);
      },

      "test wrong password"() {
        const result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');

        assert.exception(function () {
          session._rpcs.SRPChangePassword.call(v.conn, response);
        });

        assert.same('wrong', v.lu.$reload().srp);
      },

      "test bad newPassword"() {
        v.lu.$update('srp', SRP.generateVerifier('secret'));
        const result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');
        response.newPassword.bad = true;

        assert.exception(function () {
          session._rpcs.SRPChangePassword.call(v.conn, response);
        }, {error: 400});

        assert(SRP.checkPassword('secret', v.lu.$reload().srp));
      },
    },

    "login with token": {
      setUp() {
        userAccount.init();
      },

      tearDown() {
        userAccount.stop();
        this.intercept(koru, 'logger');
        v.conn2 && v.conn2.close();
        v.conn3 && v.conn3.close();
        v.connOther && v.connOther.close();
        koru.logger.restore();
      },

      "test logout with token"() {
        this.spy(userAccount, 'logout');
        v.conn.userId = 'uid111';
        v.conn.sessAuth = 'sessauth';

        session._commands.V.call(v.conn, 'X' + v.lu._id+'|abc');

        assert.same(v.conn.userId, null);
        assert.same(v.conn.sessAuth, null);

        assert.equals(Object.keys(v.lu.$reload().tokens).sort(), ['def', 'exp']);
        assert.calledWith(v.ws.send, 'VS');
        assert.calledWith(userAccount.logout, v.lu._id, 'abc');
      },

      "test logout without token"() {
        v.conn.userId = 'uid111';

        session._commands.V.call(v.conn, 'X');

        assert.same(v.conn.userId, null);
        assert.equals(Object.keys(v.lu.$reload().tokens).sort(), ['abc', 'def', 'exp']);
        assert.calledWith(v.ws.send, 'VS');
      },

      "test logoutOtherClients"() {
        this.spy(userAccount, 'logoutOtherClients');
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

        session._commands.V.call(v.conn, 'O' + v.lu._id+'|abc');

        assert.same(v.conn.userId, 'uid111');
        assert.same(v.conn2.userId, null);
        assert.same(v.conn3.userId, null);
        assert.same(v.connOther.userId, 'uid444');

        assert.calledWith(v.ws2.send, 'VS');
        assert.calledWith(v.ws3.send, 'VS');
        refute.calledWith(v.ws4.send, 'VS');

        assert.equals(Object.keys(v.lu.$reload().tokens).sort(), ['abc']);

        assert.calledWith(userAccount.logoutOtherClients, v.lu._id, 'abc');
      },

      "test when not logged in logoutOtherClients does nothing"() {
        v.ws2 = TH.mockWs();
        v.conn2 = TH.sessionConnect(v.ws2);
        v.conn2.userId = 'uid111';

        session._commands.V.call(v.conn, 'O');

        assert.same(v.conn2.userId, 'uid111');

        refute.calledWith(v.ws2.send, 'VS');
      },

      "test valid session login"() {
        session._commands.V.call(v.conn, 'L'+v.lu._id+'|abc');

        assert.same(v.conn.userId, 'uid111');

        assert.calledWith(v.ws.send, matchStart('VSuid111:'));
      },

      "test invalid session login"() {
        session._commands.V.call(v.conn, 'L'+v.lu._id+'|abcd');

        assert.same(v.conn.userId, undefined);

        assert.calledWith(v.ws.send, 'VF');
      },

      "test invalid userId"() {
        session._commands.V.call(v.conn, 'L1122|abc');

        assert.same(v.conn.userId, undefined);

        assert.calledWith(v.ws.send, 'VF');
      },
    },
  });

  function matchStart(exp) {
    return TH.match(s => typeof s === 'string' && s.startsWith(exp));
  }
});
