define(function (require, exports, module) {
  /**
   * The main or active session for client server communication.
   * See {#koru/session/web-socket-sender-factory}
   **/
  var test, v;
  const api     = require('koru/test/api');
  const geddon  = require('../test');
  const session = require('./main');

  geddon.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module(null, 'session');
    },

    tearDown() {
      v = null;
      delete session._commands.t;
    },

    "test setup"() {
      api.property('_id', () => {
        return "The session _id: "+JSON.stringify(session._id);
      });
      assert.same(session._id, 'default');
    },

    "test provide"() {
      refute(session._commands.hasOwnProperty('t'));

      refute(session.provide('t', v.t = test.stub()));
      assert.same(session.provide('t', v.t), v.t);

      assert.same(session._commands.t, v.t);
    },

    "test defineRpc"() {
      /**
       * Define a remote proceedure call
       **/
      api.method('defineRpc');
      function func() {}
      refute(session.isRpcGet("Book.update"));
      refute(session.isRpc("Book.update"));
      session.defineRpc('Book.update', func);

      test.onEnd(() => delete session._rpcs['Book.update']);

      assert.same(session._rpcs['Book.update'], func);
      refute(session.isRpcGet("Book.update"));
      assert(session.isRpc("Book.update"));
    },

    "test defineRpcGet"() {
      /**
       * Define a read-only (GET) remote proceedure call
       **/
      api.method('defineRpcGet');
      function func() {}
      refute(session.isRpc(func));
      session.defineRpcGet('Book.list', func);

      test.onEnd(() => delete session._rpcs['Book.list']);

      assert.same(session._rpcs['Book.list'], func);
      assert(session.isRpcGet('Book.list'));
      assert(session.isRpc('Book.list'));
    },
  });
});
