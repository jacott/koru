define((require, exports, module)=>{
  /**
   * The main or active session for client server communication.
   * See {#koru/session/web-socket-sender-factory}
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const Session         = require('./main');

  const {stub, spy, onEnd} = TH;

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module({subjectName: 'Session'});
    });

    afterEach(()=>{
      delete Session._commands.t;
    });

    test("setup", ()=>{
      api.property('_id', () => {
        return "The Session _id: "+JSON.stringify(Session._id);
      });
      assert.same(Session._id, 'default');
    });

    test("provide", ()=>{
      refute.hasOwn(Session._commands, 't');

      let t;

      refute(Session.provide('t', t = stub()));
      assert.same(Session.provide('t', t), t);

      assert.same(Session._commands.t, t);
    });

    test("defineRpc", ()=>{
      /**
       * Define a remote proceedure call
       **/
      api.method('defineRpc');
      function func() {}
      //[
      refute(Session.isRpcGet("Book.update"));
      refute(Session.isRpc("Book.update"));
      Session.defineRpc('Book.update', func);//]

      onEnd(() => delete Session._rpcs['Book.update']);
      //[#
      assert.same(Session._rpcs['Book.update'], func);
      refute(Session.isRpcGet("Book.update"));
      assert(Session.isRpc("Book.update"));
      //]
    });

    test("defineRpcGet", ()=>{
      /**
       * Define a read-only (GET) remote proceedure call
       **/
      api.method('defineRpcGet');
      function func() {}
      refute(Session.isRpc(func));
      Session.defineRpcGet('Book.list', func);

      onEnd(() => delete Session._rpcs['Book.list']);

      assert.same(Session._rpcs['Book.list'], func);
      assert(Session.isRpcGet('Book.list'));
      assert(Session.isRpc('Book.list'));
    });
  });
});
