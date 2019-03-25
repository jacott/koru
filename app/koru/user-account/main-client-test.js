define((require, exports, module)=>{
  'use strict';
  const localStorage    = require('../local-storage');
  const koru            = require('../main');
  const session         = require('../session');
  const SRP             = require('../srp/srp');
  const TH              = require('../test-helper');
  const util            = require('../util');
  const login           = require('./client-login');

  const {test$} = require('koru/symbols');

  const {stub, spy, onEnd, match: m} = TH;

  const userAccount = require('./main');

  let v = null;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v = {};
      v.oldUserId = util.thread.userId;
      v.handle = login.onChange(session, v.onChange = stub());
      stub(session, 'rpc');
    });

    afterEach(()=>{
      util.thread.userId = v.oldUserId;
      v.handle && v.handle.stop();
      v = null;
      login.wait(session);
    });

    test("secureCall", ()=>{
      assert.isTrue(session.isRpcGet('SRPBegin'));
      userAccount.secureCall('fooBar', 'email@vimaly.com',
                             'secret', [1, 2], v.callback = stub());

      assert.calledWithExactly(
        session.rpc, 'SRPBegin',
        m(request =>{
          v.request = request;
          assert.same(request.email, 'email@vimaly.com');
          return ('A' in request);
        }),
        m(callback => v.sutCallback = callback)
      );

      const verifier = SRP.generateVerifier('secret');
      const srp = new SRP.Server(verifier);
      const challenge = srp.issueChallenge({A: v.request.A});

      session.rpc.reset();
      v.sutCallback(null, challenge);

      assert.calledWith(session.rpc, 'fooBar', m((response)=>{
        assert.equals(response.payload, [1, 2]);

        if (response.M === srp.M) {
          session.rpc.yield(null, {
            HAMK: srp.HAMK,
          });
          return true;
        }
      }));
    });

    group("changePassword", ()=>{
      beforeEach(()=>{
        userAccount.changePassword('foo@bar.co', 'secret', 'new pw', v.callback = stub());

        assert.calledWithExactly(
          session.rpc, 'SRPBegin',
          m(request =>{
            v.request = request;
            assert.same(request.email, 'foo@bar.co');
            return ('A' in request);

          }),
          m(callback => (v.sutCallback = callback, true))
        );

      });

      test("success", ()=>{
        assert.isTrue(session.isRpcGet('SRPChangePassword'));
        const verifier = SRP.generateVerifier('secret');
        const srp = new SRP.Server(verifier);
        const challenge = srp.issueChallenge({A: v.request.A});

        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(session.rpc, 'SRPChangePassword', m(response =>{
          assert(SRP.checkPassword('new pw', response.newPassword));
          if (response.M === srp.M) {
            session.rpc.yield(null, {
              HAMK: srp.HAMK,
            });
            return true;
          }
        }));

        assert.calledWithExactly(v.callback);
      });

      test("failure", ()=>{
        const verifier = SRP.generateVerifier('bad');
        const srp = new SRP.Server(verifier);
        const challenge = srp.issueChallenge({A: v.request.A});

        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(session.rpc, 'SRPChangePassword', m(response =>{
          session.rpc.yield(null, {
            HAMK: srp.HAMK,
          });
          return true;
        }));

        assert.calledWithExactly(v.callback, 'failure');
      });
    });

    group("loginWithPassword", ()=>{
      beforeEach(()=>{
        userAccount.loginWithPassword('foo@bar.co', 'secret', v.callback = stub());

        assert.calledWithExactly(
          session.rpc, 'SRPBegin',
          m(request =>{
            v.request = request;
            assert.same(request.email, 'foo@bar.co');
            return ('A' in request);

          }),
          m(callback =>{
            v.sutCallback = callback;
            return true;
          })
        );
      });

      test("success", ()=>{
        const verifier = SRP.generateVerifier('secret');
        const srp = new SRP.Server(verifier);
        const challenge = srp.issueChallenge({A: v.request.A});

        assert.isTrue(session.isRpcGet('SRPLogin'));
        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(session.rpc, 'SRPLogin', m(response =>{
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
        assert.same(userAccount.token, 'tokenId|token123');
      });

      test("bad username", ()=>{
        v.sutCallback('Xfailure');

        assert.calledWith(v.callback, 'Xfailure');

        refute.calledWith(session.rpc, 'SRPLogin');
      });

      test("bad password", ()=>{
        const orig = util.thread.userId;
        const verifier = SRP.generateVerifier('bad');
        const srp = new SRP.Server(verifier);
        const challenge = srp.issueChallenge({A: v.request.A});

        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(session.rpc, 'SRPLogin', m(response =>{
          session.rpc.yield(null, {
            userId: 'uid123',
            HAMK: srp.HAMK,
          });
          return true;
        }));

        assert.calledWithExactly(v.callback, 'failure');
        assert.same(util.thread.userId, orig);
      });

      test("bad final response", ()=>{
        const orig = util.thread.userId;
        const verifier = SRP.generateVerifier('secret');
        const srp = new SRP.Server(verifier);
        const challenge = srp.issueChallenge({A: v.request.A});

        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(session.rpc, 'SRPLogin', m(response =>{
          return response.M === srp.M;
        }));
        session.rpc.yield('failure');

        assert.calledWithExactly(v.callback, 'failure');
      });
    });

    test("setSessionPersistence", ()=>{
      onEnd(() => {
        userAccount.stop();
        userAccount[test$].storage = localStorage;
      });
      assert.same(userAccount[test$].storage, localStorage);
      const myStorage = {
        getItem: stub().returns('my token'),
        removeItem: stub(),
      };
      userAccount[test$].storage = myStorage;
      assert.same(userAccount[test$].storage, myStorage);
      stub(session, 'send');
      userAccount.logout();
      assert.calledWith(myStorage.removeItem, 'koru.loginToken');
      assert.calledWith(session.send, 'VXmy token');
    });

    group("token login/logout", ()=>{
      beforeEach(()=>{
        session.state._state = 'ready';
        stub(session, 'send');
        userAccount.init();
      });

      afterEach(()=>{
        userAccount.stop();
      });

      test("resetPassword", ()=>{
        assert.isTrue(session.isRpcGet('resetPassword'));
        userAccount.resetPassword('the key', 'new password', v.callback = stub());
        assert.calledWith(session.rpc, 'resetPassword', 'the key',
                          m(hash =>  SRP.checkPassword('new password', hash)),
                          v.callback);
      });

      test("logout ", ()=>{
        util.thread.userId = 'userId456';
        userAccount.token = 'abc|def';
        assert.same(localStorage.getItem('koru.loginToken'), 'abc|def');

        userAccount.logout();
        assert.calledWith(session.send, 'VX' + 'abc|def');

        session._onMessage(session, 'VS');

        assert.same(koru.userId(), null);
        assert.same(localStorage.getItem('koru.loginToken'), null);
      });

      test("logoutOtherClients", ()=>{
        localStorage.setItem('koru.loginToken', 'abc|def');
        userAccount.logoutOtherClients();
        assert.calledWith(session.send, 'VO' + 'abc|def');

        assert.same(localStorage.getItem('koru.loginToken'), 'abc|def');
      });

      test("sending login token", ()=>{
        assert.same(session.state._onConnect['05-login'], userAccount[test$].onConnect);

        refute.calledWith(session.send, 'VL');

        localStorage.setItem('koru.loginToken', 'tokenId|token123');
        userAccount[test$].onConnect(session);

        assert.same(login.getState(session), 'wait');

        assert.calledWith(v.onChange, 'wait');
        assert.calledWith(session.send, 'VL', 'tokenId|token123');

        session._onMessage(session, 'VSuid123:sid|crypto');

        assert.calledWith(v.onChange, 'change');
        assert.same(login.getState(session), 'change');

        assert.same(koru.userId(), 'uid123');
        assert.same(session.sessAuth, 'sid|crypto');

        session._onMessage(session, 'VC');

        assert.same(login.getState(session), 'ready');
        assert.calledWith(v.onChange, 'ready');
      });

      test("receiving token", ()=>{
        session._onMessage(session, 'VTthe_token');

        assert.same(localStorage.getItem('koru.loginToken'), 'the_token');
      });

      test("no loginToken onConnect", ()=>{
        stub(login, 'ready');

        userAccount[test$].onConnect();

        assert.called(login.ready);
      });

      test("login failure", ()=>{
        localStorage.setItem('koru.loginToken', 'tokenId|token123');
        userAccount[test$].onConnect(session);

        session._onMessage(session, 'VF');

        assert.same(login.getState(session), 'failure');
        assert.calledWith(v.onChange, 'failure');
      });
    });
  });
});
