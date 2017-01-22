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

    "test defining"() {
      /**
       * Define a remote proceedure call
       **/
      api.method('defineRpc');
      function func() {}
      session.defineRpc('Book.list', func);

      test.onEnd(() => delete session._rpcs['Book.list']);

      assert.same(session._rpcs['Book.list'], func);
    },
  });
});
