define(function (require, exports, module) {
  /**
   * Utilities to help test server publish/subscribe
   **/
  const koru      = require('koru');
  const session   = require('koru/session');
  const message   = require('koru/session/message');
  const publish   = require('koru/session/publish');
  const scFactory = require('koru/session/server-connection-factory');
  const api       = require('koru/test/api');
  const TH        = require('koru/test/main');
  const Stubber   = require('koru/test/stubber');
  const publishTH = require('./publish-test-helper-server');

  const {stub, spy, onEnd} = TH;

  const SessionBase = session.constructor;

  let v = null;
  TH.testCase(module, {
    setUp() {
      v = {};
      api.module(null, 'publishTH');
    },

    tearDown() {
      v = null;
    },

    "test mockSession"() {
      /**
       * Create mock [Session](#koru/session/main)
       **/
      api.method("mockSession");

      stub(message, 'newGlobalDict').returns("stubbedGlobalDict");

      let mockSession = publishTH.mockSession("myMockSession");
      assert(mockSession instanceof SessionBase);
      assert.same(mockSession._id, "myMockSession");
      refute.same(mockSession.constructor, SessionBase);
      assert.same(mockSession.globalDict, "stubbedGlobalDict");

      mockSession = publishTH.mockSession();
      assert.same(mockSession._id, "mock");
    },

    "test mockConnection"() {
      /**
       * Create mock
       * [SeverConnection](#koru/session/server-connection-factory::ServerConnection)
       **/
      api.method("mockConnection");
      stub(koru, 'userId').returns("u123");

      let mockConnection = publishTH.mockConnection("s456", v.sess = publishTH.mockSession());

      assert.same(mockConnection._session, v.sess);
      assert.same(mockConnection.sessId, "s456");


      assert(mockConnection instanceof scFactory.Base);
      assert(Stubber.isStubbed(mockConnection.sendBinary));
      assert(Stubber.isStubbed(mockConnection.added));
      assert(Stubber.isStubbed(mockConnection.changed));
      assert(Stubber.isStubbed(mockConnection.removed));
      assert.equals(mockConnection.userId, "u123");

      stub(publishTH, 'mockSession').returns(v.sess = {});

      mockConnection = publishTH.mockConnection();
      assert.called(publishTH.mockSession);
      assert.same(mockConnection._session, v.sess);
      assert.same(mockConnection.sessId, "s123");
    },

    "test mockSubscribe"() {
      /**
       * Simulate a client subscribing to a publication
       *
       * @param v a holder for test variables. Expects `v.session` to
       * be a mockSession. `v.conn` will be set to a `mockConnection`
       * unless it already exists.

       * @param id the id of the subscription

       * @param name the name of the publication
       *
       * @param {...any-type} [args] any arguments to send to the publication
       **/
      api.method("mockSubscribe");

      v.session = publishTH.mockSession();
      v.session._commands.P = session._commands.P;
      onEnd(() => delete publish._pubs.Book);

      const bookPub = publish._pubs.Book = stub();

      let sub = publishTH.mockSubscribe(v, 's123', 'Book', v.args = {author: 'Jane Austen'});
      assert(sub);
      assert.same(sub.id, 's123');

      assert.calledWith(bookPub, v.args);
      assert.same(bookPub.firstCall.thisValue, sub);
    },
  });
});
