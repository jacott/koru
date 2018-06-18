define(function (require, exports, module) {
  /**
   * The main or active session for client server communication.
   * See {#koru/session/web-socket-sender-factory}
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const session         = require('./main');

  const {stub, spy, onEnd} = TH;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      api.module({subjectName: 'session'});
    });

    afterEach(()=>{
      delete session._commands.t;
    });

    test("setup", ()=>{
      api.property('_id', () => {
        return "The session _id: "+JSON.stringify(session._id);
      });
      assert.same(session._id, 'default');
    });

    test("provide", ()=>{
      refute.hasOwn(session._commands, 't');

      let t;

      refute(session.provide('t', t = stub()));
      assert.same(session.provide('t', t), t);

      assert.same(session._commands.t, t);
    });

    test("defineRpc", ()=>{
      /**
       * Define a remote proceedure call
       **/
      api.method('defineRpc');
      function func() {}
      refute(session.isRpcGet("Book.update"));
      refute(session.isRpc("Book.update"));
      session.defineRpc('Book.update', func);

      onEnd(() => delete session._rpcs['Book.update']);

      assert.same(session._rpcs['Book.update'], func);
      refute(session.isRpcGet("Book.update"));
      assert(session.isRpc("Book.update"));
    });

    test("defineRpcGet", ()=>{
      /**
       * Define a read-only (GET) remote proceedure call
       **/
      api.method('defineRpcGet');
      function func() {}
      refute(session.isRpc(func));
      session.defineRpcGet('Book.list', func);

      onEnd(() => delete session._rpcs['Book.list']);

      assert.same(session._rpcs['Book.list'], func);
      assert(session.isRpcGet('Book.list'));
      assert(session.isRpc('Book.list'));
    });
  });
});
