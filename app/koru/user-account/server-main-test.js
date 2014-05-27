isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../session/test-helper');
  var session = require('../session/main');
  var main = require('./server-main');
  var Model = require('../model/main');
  var env = require('../env');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.ws = TH.mockWs();
      test.stub(env, 'logger');
      v.conn = TH.sessionConnect(v.ws);
      env.logger.restore();
      v.lu = main.createUser({userId: 'uid111', email: 'foo@bar.co', tokens: {abc: Date.now()+24*1000*60*60}});
    },

    tearDown: function () {
      test.stub(env, 'logger');
      v.conn.close();
      env.logger.restore();
      Model.UserAccount.docs.remove({});
      v = null;
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
