define(function (require, exports, module) {
  /**
   * The main or active session for client server communication.
   * See {@module koru/session/main.constructor}
   **/
  var test, v;
  const api     = require('koru/test/api');
  const geddon  = require('../test');
  const session = require('./main');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      api.module(null, 'session');
    },

    tearDown: function () {
      v = null;
      delete session._commands.t;
    },

    "test setup": function () {
      api.property('_id', () => {
        return "The session _id: "+JSON.stringify(session._id);
      });
      assert.same(session._id, 'default');
    },

    "test provide": function () {
      refute(session._commands.hasOwnProperty('t'));

      refute(session.provide('t', v.t = test.stub()));
      assert.same(session.provide('t', v.t), v.t);

      assert.same(session._commands.t, v.t);
    },

    "test defining": function () {
      /**
       * Define a remote proceedure call
       **/
      api.method('defineRpc');
      function func() {}
      session.defineRpc('Book.list', func);

      test.onEnd(() => delete session._rpcs['Book.list']);

      assert.same(session._rpcs['Book.list'], func);
    },

    "test Session"() {
      /**
       * Create a new session
       **/
      function abstract() {
        /**
         * The constructor for {@module koru/session/main}. This is
         * also used by {@module
         * koru/session/web-socket-sender-factory} and {@module
         * koru/session/web-socket-server-factory}.
         *
         **/
      }

      const bsApi = api.innerSubject('constructor', 'BaseSession', {abstract});

      const mySession = bsApi.new()('mySession');

      assert.same(mySession.constructor, session.constructor);
    },
  });
});
