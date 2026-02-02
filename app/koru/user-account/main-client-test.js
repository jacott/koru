define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const SRP             = require('koru/crypto/srp');
  const localStorage    = require('koru/local-storage');
  const session         = require('koru/session');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
  const login           = require('./client-login');

  const {stub, spy, match: m, stubProperty} = TH;

  const UserAccount = require('./main');

  let v = null;

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      v = {};
      v.oldUserId = util.thread.userId;
      v.handle = login.onChange(session, v.onChange = stub());
      stub(session, 'rpc');
    });

    afterEach(() => {
      util.thread.userId = v.oldUserId;
      v.handle && v.handle.stop();
      v = null;
      login.wait(session);
    });

    group('srp', () => {
      beforeEach(() => {
        UserAccount.mode = 'srp';
      });

      afterEach(() => {
        UserAccount.mode = 'default';
      });

      test('secureCall', () => {
        assert.isTrue(session.isRpcGet('SRPBegin'));
        UserAccount.secureCall('fooBar', 'email@vimaly.com', 'secret', [1, 2], v.callback = stub());

        assert.calledWithExactly(
          session.rpc,
          'SRPBegin',
          m((request) => {
            v.request = request;
            assert.same(request.email, 'email@vimaly.com');
            return ('A' in request);
          }),
          m((callback) => v.sutCallback = callback),
        );

        const verifier = SRP.generateVerifier('secret');
        const srp = new SRP.Server(verifier);
        const challenge = srp.issueChallenge({A: v.request.A});

        session.rpc.reset();
        v.sutCallback(null, challenge);

        assert.calledWith(
          session.rpc,
          'fooBar',
          m((response) => {
            assert.equals(response.payload, [1, 2]);

            if (response.M === srp.M) {
              session.rpc.yield(null, {HAMK: srp.HAMK});
              return true;
            }
          }),
        );
      });

      group('changePassword', () => {
        beforeEach(() => {
          UserAccount.changePassword('foo@bar.co', 'secret', 'new pw', v.callback = stub());

          assert.calledWithExactly(
            session.rpc,
            'SRPBegin',
            m((request) => {
              v.request = request;
              assert.same(request.email, 'foo@bar.co');
              return ('A' in request);
            }),
            m((callback) => (v.sutCallback = callback, true)),
          );
        });

        test('success', () => {
          assert.isTrue(session.isRpcGet('SRPChangePassword'));
          const verifier = SRP.generateVerifier('secret');
          const srp = new SRP.Server(verifier);
          const challenge = srp.issueChallenge({A: v.request.A});

          session.rpc.reset();
          v.sutCallback(null, challenge);

          assert.calledWith(
            session.rpc,
            'SRPChangePassword',
            m((response) => {
              assert(SRP.checkPassword('new pw', response.newPassword));
              if (response.M === srp.M) {
                session.rpc.yield(null, {HAMK: srp.HAMK});
                return true;
              }
            }),
          );

          assert.calledWithExactly(v.callback);
        });

        test('failure', () => {
          const verifier = SRP.generateVerifier('bad');
          const srp = new SRP.Server(verifier);
          const challenge = srp.issueChallenge({A: v.request.A});

          session.rpc.reset();
          v.sutCallback(null, challenge);

          assert.calledWith(
            session.rpc,
            'SRPChangePassword',
            m((response) => {
              session.rpc.yield(null, {HAMK: srp.HAMK});
              return true;
            }),
          );

          assert.calledWithExactly(v.callback, 'failure');
        });
      });

      group('loginWithPassword', () => {
        beforeEach(() => {
          UserAccount.loginWithPassword('foo@bar.co', 'secret', v.callback = stub());

          assert.calledWithExactly(
            session.rpc,
            'SRPBegin',
            m((request) => {
              v.request = request;
              assert.same(request.email, 'foo@bar.co');
              return ('A' in request);
            }),
            m((callback) => {
              v.sutCallback = callback;
              return true;
            }),
          );
        });

        test('success', () => {
          const verifier = SRP.generateVerifier('secret');
          const srp = new SRP.Server(verifier);
          const challenge = srp.issueChallenge({A: v.request.A});

          assert.isTrue(session.isRpcGet('SRPLogin'));
          session.rpc.reset();
          v.sutCallback(null, challenge);

          assert.calledWith(
            session.rpc,
            'SRPLogin',
            m((response) => {
              if (response.M === srp.M) {
                session.rpc.yield(null, {
                  userId: 'uid123',
                  HAMK: srp.HAMK,
                  loginToken: 'tokenId|token123',
                });
                return true;
              }
            }),
          );

          assert.calledWithExactly(v.callback, null);
          assert.same(util.thread.userId, 'uid123');
          assert.same(localStorage.getItem('koru.loginToken'), 'tokenId|token123');
          assert.same(UserAccount.token, 'tokenId|token123');
        });

        test('bad username', () => {
          v.sutCallback('Xfailure');

          assert.calledWith(v.callback, 'Xfailure');

          refute.calledWith(session.rpc, 'SRPLogin');
        });

        test('bad password', () => {
          const orig = util.thread.userId;
          const verifier = SRP.generateVerifier('bad');
          const srp = new SRP.Server(verifier);
          const challenge = srp.issueChallenge({A: v.request.A});

          session.rpc.reset();
          v.sutCallback(null, challenge);

          assert.calledWith(
            session.rpc,
            'SRPLogin',
            m((response) => {
              session.rpc.yield(null, {userId: 'uid123', HAMK: srp.HAMK});
              return true;
            }),
          );

          assert.calledWithExactly(v.callback, 'failure');
          assert.same(util.thread.userId, orig);
        });

        test('bad final response', () => {
          const orig = util.thread.userId;
          const verifier = SRP.generateVerifier('secret');
          const srp = new SRP.Server(verifier);
          const challenge = srp.issueChallenge({A: v.request.A});

          session.rpc.reset();
          v.sutCallback(null, challenge);

          assert.calledWith(
            session.rpc,
            'SRPLogin',
            m((response) => {
              return response.M === srp.M;
            }),
          );
          session.rpc.yield('failure');

          assert.calledWithExactly(v.callback, 'failure');
        });
      });

      test('resetPassword', () => {
        assert.isTrue(session.isRpcGet('resetPassword'));
        UserAccount.resetPassword('the key', 'new password', v.callback = stub());
        assert.calledWith(
          session.rpc,
          'resetPassword',
          'the key',
          m((hash) => SRP.checkPassword('new password', hash)),
          v.callback,
        );
      });
    });

    test('mode change', () => {
      after(() => {
        UserAccount.mode = 'default';
      });

      assert.equals(UserAccount.mode, 'plain');

      UserAccount.mode = 'srp';
      assert.equals(UserAccount.mode, 'srp');

      assert.exception(() => {
        UserAccount.mode = 'wrong';
      }, {message: 'invalid UserAccount mode'});

      UserAccount.mode = 'default';
      assert.equals(UserAccount.mode, 'plain');
    });

    group('plain', () => {
      const assertRemote = (name, ...args) => {
        const callback = stub();
        const remoteName = 'UserAccount.' + name;
        UserAccount[name](...args, callback);
        assert.elide(() => {
          assert.calledWith(session.rpc, remoteName, ...args, m.func);
          assert.msg('should defineRpcGet')(session.isRpcGet(remoteName));
        });
        return callback;
      };

      test('loginWithPassword', () => {
        const callback = assertRemote('loginWithPassword', 'foo@bar.co', 'secret');
        refute.called(callback);
        const get = stub(), set = stub();
        stubProperty(UserAccount, 'token', {get, set});
        stub(login, 'setUserId');

        session.rpc.yield('error');
        assert.calledWith(callback, 'error');
        callback.reset();
        refute.called(set);
        session.rpc.yield(null, {loginToken: 'loginToken', userId: 'userId'});
        assert.calledWith(callback, null);
        assert.calledWith(set, 'loginToken');
        assert.calledWith(login.setUserId, session, 'userId');
      });

      test('changePassword', () => {
        assertRemote('changePassword', 'foo@bar.co', 'secret', 'new pw');
      });

      test('resetPassword', () => {
        const callback = stub();
        const args = ['the key', 'new password'];
        UserAccount.resetPassword(...args, callback);
        assert.calledWith(session.rpc, 'resetPassword', ...args, callback);
        assert.msg('should defineRpcGet')(session.isRpcGet('resetPassword'));
      });

      test('secureCall', () => {
        assertRemote('secureCall', 'foobar', 'foo@bar.co', 'secret', [1, 2, 3]);
      });
    });

    test('setSessionPersistence', () => {
      after(() => {
        UserAccount.stop();
        UserAccount[isTest].storage = localStorage;
      });
      assert.same(UserAccount[isTest].storage, localStorage);
      const myStorage = {getItem: stub().returns('my token'), removeItem: stub()};
      UserAccount[isTest].storage = myStorage;
      assert.same(UserAccount[isTest].storage, myStorage);
      stub(session, 'send');
      UserAccount.logout();
      assert.calledWith(myStorage.removeItem, 'koru.loginToken');
      assert.calledWith(session.send, 'VXmy token');
    });

    group('token login/logout', () => {
      beforeEach(() => {
        session.state._state = 'ready';
        stub(session, 'send');
        UserAccount.start();
      });

      afterEach(() => {
        UserAccount.stop();
      });

      test('logout ', () => {
        util.thread.userId = 'userId456';
        UserAccount.token = 'abc|def';
        assert.same(localStorage.getItem('koru.loginToken'), 'abc|def');

        UserAccount.logout();
        assert.calledWith(session.send, 'VX' + 'abc|def');

        session._onMessage(session, 'VS');

        assert.same(koru.userId(), void 0);
        assert.same(localStorage.getItem('koru.loginToken'), null);
      });

      test('logoutOtherClients', () => {
        localStorage.setItem('koru.loginToken', 'abc|def');
        const callback = stub();
        UserAccount.logoutOtherClients(callback);
        assert.calledWith(session.rpc, 'logoutOtherClients', 'abc|def', callback);

        assert.same(localStorage.getItem('koru.loginToken'), 'abc|def');
      });

      test('sending login token', () => {
        assert.same(session.state._onConnect['05-login'], UserAccount[isTest].onConnect);

        refute.calledWith(session.send, 'VL');

        localStorage.setItem('koru.loginToken', 'tokenId|token123');
        UserAccount[isTest].onConnect(session);

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

      test('receiving token', () => {
        session._onMessage(session, 'VTthe_token');

        assert.same(localStorage.getItem('koru.loginToken'), 'the_token');
      });

      test('no loginToken onConnect', () => {
        stub(login, 'ready');

        UserAccount[isTest].onConnect();

        assert.called(login.ready);
      });

      test('login failure', () => {
        localStorage.setItem('koru.loginToken', 'tokenId|token123');
        UserAccount[isTest].onConnect(session);

        session._onMessage(session, 'VF');

        assert.same(login.getState(session), 'failure');
        assert.calledWith(v.onChange, 'failure');
      });
    });
  });
});
