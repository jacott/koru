isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../session/test-helper');
  var session = require('../session/main');
  var userAccount = require('./server-main');
  var Model = require('../model/main');
  var env = require('../env');
  var SRP = require('../srp/srp');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.ws = TH.mockWs();
      test.stub(env, 'logger');
      v.conn = TH.sessionConnect(v.ws);
      env.logger.restore();
      v.lu = userAccount.createUser({userId: 'uid111', srp: SRP.generateVerifier('secret'), email: 'foo@bar.co', tokens: {abc: Date.now()+24*1000*60*60}});
    },

    tearDown: function () {
      test.stub(env, 'logger');
      v.conn.close();
      env.logger.restore();
      Model.UserAccount.docs.remove({});
      v = null;
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

        result = session._rpcs.SRPLogin.call(v.conn, response);

        assert(v.srp.verifyConfirmation({HAMK: result.HAMK}));
      },

      "test wrong password": function () {
        v.lu.$update({srp: 'wrong'});
        var result = session._rpcs.SRPBegin.call(v.conn, v.request);

        var response = v.srp.respondToChallenge(result);

        result = session._rpcs.SRPLogin.call(v.conn, response);

        refute(v.srp.verifyConfirmation({HAMK: result.HAMK}));
      },

      "test wrong email": function () {
        v.lu.$update({email: 'bad@bar.co'});
        assert.exception(function () {
          session._rpcs.SRPBegin.call(v.conn, v.request);
        });
      },
    },

    "test valid session login": function () {
      session._commands.V.call(v.conn, 'L'+v.lu._id+'|abc');

      assert.same(v.conn.userId, 'uid111');

      assert.calledWith(v.ws.send, 'VS');
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
  });
});
