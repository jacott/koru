define((require, exports, module)=>{
  'use strict';
  /**
   * Authenticate Users.
   **/
  const Email           = require('koru/email');
  const koru            = require('koru/main');
  const Model           = require('koru/model/main');
  const Val             = require('koru/model/validation');
  const Random          = require('koru/random').global;
  const session         = require('koru/session');
  const TH              = require('koru/session/test-helper');
  const SRP             = require('koru/srp/srp');
  const util            = require('koru/util');

  const crypto          = requirejs.nodeRequire('crypto');

  const {stub, spy, intercept, match: m, stubProperty} = TH;

  const UserAccount = require('./main');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      TH.noInfo();
      spy(Val, 'assertCheck');
      spy(Val, 'ensureString');
    });
    beforeEach(()=>{
      v.ws = TH.mockWs();
      v.conn = TH.sessionConnect(v.ws);
      v.lu = UserAccount.UserLogin.create({
        userId: 'uid111', password: 'wrong', email: 'foo@bar.co',
        tokens: {abc: Date.now()+24*1000*60*60, exp: Date.now(), def: Date.now()+48*1000*60*60}});

      stub(crypto, 'randomBytes', (num, cb) => {
        if (cb) {
          cb(null, {toString: stub().withArgs('base64').returns('crypto64Id')});
        } else {
          const ary = Buffer.alloc(num);
          for(let i = 0; i < ary.length; ++i) {
            ary[i] = i;
          }
          return ary;
        }
      });
    });

    afterEach(()=>{
      Val.assertCheck.reset();
      Val.ensureString.reset();
      UserAccount.model.docs.remove({});
      intercept(koru, 'logger');
      v.conn.close();
      koru.logger.restore();
      v = {};
    });

    test("makeResetPasswordKey", ()=>{
      stub(Random, 'id')
        .onCall(0).returns('randid=')
        .onCall(1).returns('r2');

      const ans = UserAccount.makeResetPasswordKey({_id: 'uid111'});
      assert.equals(ans.attributes, v.lu.$reload().attributes);

      assert.between(ans.resetTokenExpire, Date.now() + 23*60*60*1000 , Date.now() + 25*60*60*1000);
      assert.equals(ans.resetToken, 'randid=r2');
    });

    group("scrypt", ()=>{
      let derivedKey = void 0;
      const myScript = (password, salt, len, opts, callback)=>{
        assert.same(len, 64);
        assert.same(opts, void 0);
        callback(null, Buffer.from(derivedKey(password, salt), 'hex'));
      };

      test("loginWithPassword", ()=>{
        const scrypt = stub(crypto, 'scrypt', myScript);

        const {conn, lu} = v;

        derivedKey = (password, salt)=>{
          if (password === 'secret' && salt.toString('hex') === '001122')
            return '44332211';
          else
            return '00990011';
        };

        lu.$update('password', {type: 'scrypt', salt: '001122', key: '44332211'});

        assert.exception(()=>{
          let result = session._rpcs['UserAccount.loginWithPassword'].call(
            conn, lu.email, 'wrong password');
        }, {error: 403, reason: 'Invalid password'});

        const result = session._rpcs['UserAccount.loginWithPassword'].call(conn, 'foo@bar.co', 'secret');

        assert.equals(result, {userId: 'uid111', loginToken: lu._id+'|1234567890abcdefg'});

        assert.same(conn.userId, 'uid111');

        lu.$reload();

        assert.equals(lu.tokens['1234567890abcdefg'], m.number);
      });

      test("changePassword", ()=>{
        const scrypt = stub(crypto, 'scrypt', myScript);

        const {conn, lu} = v;

        derivedKey = (password, salt)=>{
          if (password === 'old password' && salt.toString('hex') === '001122')
            return '44332211';
          else if (password === 'new password' && salt.toString('hex') !== '001122')
            return '77665544';
          else
            return '00990011';
        };

        assert.exception(()=>{ // not scrypt
          let result = session._rpcs['UserAccount.changePassword'].call(
            conn, lu.email, 'old password', 'new password');
        }, {error: 403, reason: 'failure'});

        lu.$update('password', {type: 'scrypt', salt: '001122', key: '44332211'});

        assert.exception(()=>{
          let result = session._rpcs['UserAccount.changePassword'].call(
            conn, lu.email, 'old passwordx', 'new password');
        }, {error: 403, reason: 'Invalid password'});

        assert.exception(()=>{
          let result = session._rpcs['UserAccount.changePassword'].call(
            conn, lu.email+'x', 'old password', 'new password');
        }, {error: 403, reason: 'failure'});

        let result = session._rpcs['UserAccount.changePassword'].call(
          conn, lu.email, 'old password', 'new password');

        assert.same(result, void 0);

        lu.$reload();

        assert.equals(lu.password, {type: 'scrypt', salt: m.string, key: '77665544'});
      });

      test("secureCall", ()=>{
        const {conn, lu} = v;
        const scrypt = stub(crypto, 'scrypt', myScript);

        derivedKey = (password, salt)=>{
          if (password === 'secret' && salt.toString('hex') === '001122')
            return '44332211';
          else
            return '00990011';
        };

        lu.$update('password', {type: 'scrypt', salt: '001122', key: '44332211'});

        assert.exception(()=>{
          session._rpcs['UserAccount.secureCall'].call(
            conn, 'foobar', lu.email, 'wrongSecret', [1,2,3]);
        }, {error: 403, reason: 'Invalid password'});

        stub(session, 'rpc').withArgs('foobar', 1, 2, 3).invokes(c => {
          assert.same(conn.secure, lu);
          return 'foobar success';
        });
        let result = session._rpcs['UserAccount.secureCall'].call(
          conn, 'foobar', lu.email, 'secret', [1,2,3]);
        assert.same(result, 'foobar success');
        assert.same(conn.secure, void 0);
      });

      test("verifyClearPassword", ()=>{
        const {conn, lu} = v;
        const scrypt = stub(crypto, 'scrypt', myScript);

        derivedKey = (password, salt)=>{
          if (password === 'secret' && salt.toString('hex') === '001122')
            return '44332211';
          else
            return '00990011';
        };

        lu.$update('password', {type: 'scrypt', salt: '001122', key: '44332211'});

        assert.same(UserAccount.verifyClearPassword(lu.email, 'bad'), void 0);

        const docToken = UserAccount.verifyClearPassword(lu.email, 'secret');
        assert.same(docToken[0], lu);

        assert(UserAccount.verifyToken('foo@bar.co', docToken[1]));
      });
    });

    group("sendResetPasswordEmail", ()=>{
      beforeEach(()=>{
        stub(Email, 'send');
        v.UserAccountConfig = koru.config.userAccount;
        koru.config.userAccount = {
          emailConfig: {
            sendResetPasswordEmailText(user, token) {
              return "userid: " + user._id + " token: " + token;
            },

            from: 'Koru <koru@vimaly.com>',
            siteName: 'Koru',
          },
        };
      });

      afterEach(()=>{
        koru.config.userAccount = v.UserAccountConfig;
      });

      test("send", ()=>{
        UserAccount.sendResetPasswordEmail({_id: 'uid111'});

        const tokenExp =  v.lu.$reload().resetTokenExpire;

        assert.between(tokenExp, Date.now() + 23*60*60*1000 , Date.now() + 25*60*60*1000);

        assert.calledWith(Email.send, {
          from: 'Koru <koru@vimaly.com>',
          to: 'foo@bar.co',
          subject: 'How to reset your password on Koru',
          text: 'userid: uid111 token: ' + v.lu._id+'-'+v.lu.resetToken,
        });
      });
    });

    test("UserLogin", ()=>{
      assert.same(Model.UserLogin.modelName, "UserLogin");
    });

    test("createUserLogin srp (default)", ()=>{
      const generateVerifier = spy(SRP, 'generateVerifier');
      const lu = UserAccount.createUserLogin({
        email: 'alice@vimaly.com', userId: "uid1", password: 'test pw'});

      assert.calledWith(generateVerifier, 'test pw');

      assert.equals(lu.$reload().password, generateVerifier.firstCall.returnValue);
      assert.same(lu.email, 'alice@vimaly.com');
      assert.same(lu.userId, 'uid1');
      assert.equals(lu.tokens, {});
    });

    test("createUserLogin scrypt", ()=>{
      crypto.randomBytes.restore();
      const randomBytes = spy(crypto, 'randomBytes').withArgs(16);
      const lu = UserAccount.createUserLogin({
        email: 'alice@vimaly.com', userId: "uid1", password: 'test pw', scrypt: true});

      assert.calledOnceWith(randomBytes, 16);

      const salt = randomBytes.firstCall.returnValue;

      const future = new util.Future;
      crypto.scrypt('test pw', salt, 64,
                    void 0, (err, key)=>{
                      if (err) future.throw(err);
                      else future.return(key);
                    });
      const key = future.wait().toString('hex');

      assert.same(salt.length, 16);
      assert.same(key.length, 128);

      assert.equals(lu.$reload().password, {
        type: 'scrypt',
        salt: salt.toString('hex'),
        key});
      assert.same(lu.email, 'alice@vimaly.com');
      assert.same(lu.userId, 'uid1');
      assert.equals(lu.tokens, {});
    });

    test("updateOrCreateUserLogin", ()=>{
      let lu = UserAccount.updateOrCreateUserLogin({
        email: 'alice@vimaly.com', userId: "uid1", password: 'test srp'});

      assert.equals(lu.$reload().password, 'test srp');
      assert.same(lu.email, 'alice@vimaly.com');
      assert.same(lu.userId, 'uid1');
      assert.equals(lu.tokens, {});

      lu = UserAccount.updateOrCreateUserLogin({
        email: 'bob@vimaly.com', userId: "uid1", password: 'new srp'});

      assert.equals(lu.$reload().password, 'new srp');
      assert.same(lu.email, 'bob@vimaly.com');
      assert.same(lu.userId, 'uid1');

      lu = UserAccount.updateOrCreateUserLogin({email: 'bob@vimaly.comm', userId: "uid1"});

      assert.equals(lu.$reload().password, 'new srp');
      assert.same(lu.email, 'bob@vimaly.comm');
      assert.same(lu.userId, 'uid1');
    });

    test("too many unexpiredTokens", ()=>{
      const tokens = v.lu.tokens = {};
      for(let i = 0; i < 15; ++i) {
        tokens['t'+i] = Date.now()+ (20-i)*24*1000*60*60;
      }
      assert.same(Object.keys(v.lu.unexpiredTokens()).sort().join(' '),
                  't0 t1 t2 t3 t4 t5 t6 t7 t8 t9');
    });

    test("expired tokens", ()=>{
      const tokens = v.lu.tokens = {};
      for(let i = 0; i < 5; ++i) {
        tokens['t'+i] = Date.now()+ (20-i)*24*1000*60*60;
      }

      for(let i = 0; i < 5; ++i) {
        tokens['e'+i] = Date.now() + (0-i)*24*1000*60*60;
      }

      assert.same(Object.keys(v.lu.unexpiredTokens()).sort().join(' '),
                  't0 t1 t2 t3 t4');
    });

    test("verifyClearPassword", ()=>{
      v.lu.$update('password', SRP.generateVerifier('secret'));
      let docToken = UserAccount.verifyClearPassword('foo@bar.co', 'secret');
      assert.equals(docToken && docToken[0]._id, v.lu._id);
      assert(UserAccount.verifyToken('foo@bar.co', docToken[1]));
      docToken = UserAccount.verifyClearPassword('foo@bar.co', 'secretx');
      assert.same(docToken, undefined);
    });

    test("verifyToken", ()=>{
      let doc = UserAccount.verifyToken('foo@bar.co', 'abc'); // by email and good token
      assert.equals(doc && doc._id, v.lu._id);
      doc = UserAccount.verifyToken('foo@bar.co', 'exp'); // bad token
      assert.same(doc, undefined);
      doc = UserAccount.verifyToken(v.lu._id, 'abc'); // by id and good token
      assert.equals(doc && doc._id, v.lu._id);
    });

    group("loginWithPassword", ()=>{
      beforeEach(()=>{
        v.srp = new SRP.Client('secret');
        v.request = v.srp.startExchange();
        v.request.email = 'foo@bar.co';
      });

      test("direct calling", ()=>{
        v.lu.$update('password', SRP.generateVerifier('secret'));
        const storage = {};
        let result = UserAccount.SRPBegin(storage, v.request);

        assert.equals(storage, {
          $srp: m.any, $srpUserAccount: m.field('_id', v.lu._id)});
        const response = v.srp.respondToChallenge(result);
        result = UserAccount.SRPLogin(storage, response);
        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));
        assert.same(result.userId, 'uid111');
      });

      test("success", ()=>{
        v.lu.$update('password', SRP.generateVerifier('secret'));
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
      });

      test("wrong password", ()=>{
        const result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);

        assert.exception(()=>{
          session._rpcs.SRPLogin.call(v.conn, response);
        }, {error: 403, reason: 'Invalid password'});

        assert.same(v.conn.userId, undefined);
      });

      test("wrong email", ()=>{
        v.lu.$update({email: 'bad@bar.co'});
        assert.exception(()=>{
          session._rpcs.SRPBegin.call(v.conn, v.request);
        }, {error: 403, reason: 'failure'});
      });

      test("null srp", ()=>{
        v.lu.$update('password', null);
        assert.exception(()=>{
          session._rpcs.SRPBegin.call(v.conn, v.request);
        }, {error: 403, reason: 'failure'});
      });
    });

    group("resetPassword", ()=>{
      test("scrypt", ()=>{
        const {lu, conn} = v;

        lu.$update('password', {type: 'scrypt'});

        assert.exception(()=>{
          session._rpcs.resetPassword.call(conn, 'token', 'password');
        }, {error: 404, reason: 'Expired or invalid reset request'});

        lu.resetToken = 'secretToken';
        lu.resetTokenExpire = Date.now() + 2000;
        lu.$$save();

        session._rpcs.resetPassword.call(v.conn, v.lu._id+'-secretToken', 'new password');

        v.lu.$reload();
        assert.equals(v.lu.password, {type: 'scrypt', salt: '000102030405060708090a0b0c0d0e0f',
                                 key: m(/^3c3f.*b9$/)});
      });

      test("invalid resetToken", ()=>{
        assert.exception(()=>{
          session._rpcs.resetPassword.call(v.conn, 'token', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});

        assert.exception(()=>{
          session._rpcs.resetPassword.call(v.conn, v.lu._id+'_badtoken', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});
      });

      test("expired token", ()=>{
        assert.equals(UserAccount.model.$fields.resetTokenExpire, {type: 'bigint'});

        v.lu.resetToken = 'secretToken';
        v.lu.resetTokenExpire = Date.now() -5;
        v.lu.$$save();

        assert.exception(()=>{
          session._rpcs.resetPassword.call(v.conn, v.lu._id+'_secretToken', {identity: 'abc123'});
        }, {error: 404, reason: 'Expired or invalid reset request'});
      });

      test("success", ()=>{
        spy(UserAccount, 'resetPassword');
        v.lu.resetToken = 'secretToken';
        v.lu.resetTokenExpire = Date.now() + 2000;
        v.lu.$$save();
        session._rpcs.resetPassword.call(v.conn, v.lu._id+'-secretToken', {identity: 'abc123'});

        assert.calledWith(Val.ensureString, v.lu._id+'-secretToken');
        assert.calledWith(Val.assertCheck, {identity: 'abc123'}, {
          identity: 'string', salt: 'string', verifier: 'string' });

        assert.same(v.conn.userId, v.lu.userId);
        assert.same(v.conn.loginToken, '1234567890abcdefg');
        v.lu.$reload();
        assert.equals(v.lu.password, {identity: 'abc123'});
        assert.calledWith(v.ws.send, m(data =>{
          if (typeof data !== 'string') return false;

          const m = data.match(/^VT(.*)\|(.*)$/);
          v.docId = m && m[1];
          return v.token = m && m[2];

        }));
        assert.same(v.lu._id, v.docId);
        assert.equals(UserAccount.resetPassword.firstCall.returnValue, [
          m.field('_id', v.lu._id), v.token]);
        assert.between(v.lu.tokens[v.token],
                       Date.now()+180*24*1000*60*60-1000, Date.now()+180*24*1000*60*60+1000);
        assert.equals(v.lu.resetToken, null);
        assert.equals(v.lu.resetTokenExpire, null);


        assert.calledWith(v.ws.send, matchStart('VS' + v.lu.userId));
      });
    });

    group("changePassword", ()=>{
      beforeEach(()=>{
        v.srp = new SRP.Client('secret');
        v.request = v.srp.startExchange();
        v.request.email = 'foo@bar.co';
      });

      test("intercept", ()=>{
        after(()=>{UserAccount.interceptChangePassword = null});
        UserAccount.interceptChangePassword = stub();

        v.lu.$update('password', SRP.generateVerifier('secret'));
        let result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');
        result = session._rpcs.SRPChangePassword.call(v.conn, response);

        assert.calledWith(Val.assertCheck, response.newPassword, {identity: 'string', salt: 'string', verifier: 'string'});

        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));

        assert.calledWith(UserAccount.interceptChangePassword, m.field('_id', v.lu._id),
                          response.newPassword);

        v.lu.$reload();
        refute.equals(response.newPassword, v.lu.password);
      });

      test("success", ()=>{
        v.lu.$update('password', SRP.generateVerifier('secret'));
        let result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');
        result = session._rpcs.SRPChangePassword.call(v.conn, response);

        assert.calledWith(Val.assertCheck, response.newPassword, {
          identity: 'string', salt: 'string', verifier: 'string'});

        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));

        v.lu.$reload();
        assert.equals(response.newPassword, v.lu.password);
      });

      test("wrong password", ()=>{
        const result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');

        assert.exception(()=>{
          session._rpcs.SRPChangePassword.call(v.conn, response);
        });

        assert.same('wrong', v.lu.$reload().password);
      });

      test("bad newPassword", ()=>{
        v.lu.$update('password', SRP.generateVerifier('secret'));
        const result = session._rpcs.SRPBegin.call(v.conn, v.request);

        const response = v.srp.respondToChallenge(result);
        response.newPassword = SRP.generateVerifier('new pw');
        response.newPassword.bad = true;

        assert.exception(()=>{
          session._rpcs.SRPChangePassword.call(v.conn, response);
        }, {error: 400});

        assert(SRP.checkPassword('secret', v.lu.$reload().password));
      });
    });

    group("login with token", ()=>{
      beforeEach(()=>{
        UserAccount.start();
      });

      afterEach(()=>{
        UserAccount.stop();
        intercept(koru, 'logger');
        v.conn2 && v.conn2.close();
        v.conn3 && v.conn3.close();
        v.connOther && v.connOther.close();
        koru.logger.restore();
      });

      test("logout with token", ()=>{
        spy(UserAccount, 'logout');
        v.conn.userId = 'uid111';
        v.conn.sessAuth = 'sessauth';

        session._commands.V.call(v.conn, 'X' + v.lu._id+'|abc');

        assert.same(v.conn.userId, void 0);
        assert.same(v.conn.sessAuth, null);

        assert.equals(Object.keys(v.lu.$reload().tokens).sort(), ['def', 'exp']);
        assert.calledWith(v.ws.send, 'VS');
        assert.calledWith(UserAccount.logout, v.lu._id, 'abc');
      });

      test("logout without token", ()=>{
        v.conn.userId = 'uid111';

        session._commands.V.call(v.conn, 'X');

        assert.same(v.conn.userId, void 0);
        assert.equals(Object.keys(v.lu.$reload().tokens).sort(), ['abc', 'def', 'exp']);
        assert.calledWith(v.ws.send, 'VS');
      });

      test("logoutOtherClients", ()=>{
        spy(UserAccount, 'logoutOtherClients');
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
        assert.same(v.conn2.userId, void 0);
        assert.same(v.conn3.userId, void 0);
        assert.same(v.connOther.userId, 'uid444');

        assert.calledWith(v.ws2.send, 'VS');
        assert.calledWith(v.ws3.send, 'VS');
        refute.calledWith(v.ws4.send, 'VS');

        assert.equals(Object.keys(v.lu.$reload().tokens).sort(), ['abc']);

        assert.calledWith(UserAccount.logoutOtherClients, v.lu._id, 'abc');
      });

      test("when not logged in logoutOtherClients does nothing", ()=>{
        v.ws2 = TH.mockWs();
        v.conn2 = TH.sessionConnect(v.ws2);
        v.conn2.userId = 'uid111';

        session._commands.V.call(v.conn, 'O');

        assert.same(v.conn2.userId, 'uid111');

        refute.calledWith(v.ws2.send, 'VS');
      });

      test("valid session login", ()=>{
        session._commands.V.call(v.conn, 'L'+v.lu._id+'|abc');

        assert.same(v.conn.userId, 'uid111');
        assert.same(v.conn.loginToken, 'abc');

        assert.calledWith(v.ws.send, matchStart('VSuid111:'));
      });

      test("invalid session login", ()=>{
        session._commands.V.call(v.conn, 'L'+v.lu._id+'|abcd');

        assert.same(v.conn.userId, undefined);

        assert.calledWith(v.ws.send, 'VF');
      });

      test("invalid userId", ()=>{
        session._commands.V.call(v.conn, 'L1122|abc');

        assert.same(v.conn.userId, undefined);

        assert.calledWith(v.ws.send, 'VF');
      });
    });
  });

  const matchStart = exp => m(s => typeof s === 'string' && s.startsWith(exp));
});
