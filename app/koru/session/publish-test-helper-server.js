define(function(require, exports, module) {
  const koru      = require('koru');
  const session   = require('koru/session');
  const message   = require('koru/session/message');
  const publish   = require('koru/session/publish');
  const SCFactory = require('koru/session/server-connection-factory');
  const TH        = require('koru/test/main');
  const util      = require('koru/util');

  const SessionBase = session.constructor;

  class MockSession extends SessionBase {
    constructor(id) {
      super(id);
      this._commands.P = session._commands.P;
    }
  }

  const publishTH = {
    mockConnection (sessId, session=this.mockSession()) {
      const test = TH.test;
      const conn = new (SCFactory(session))(
        {send: test.stub(), on: test.stub()}, sessId || 's123', function () {}
      );
      test.spy(conn, 'batchMessages');
      test.spy(conn, 'releaseMessages');
      test.spy(conn, 'abortMessages');
      conn.userId = koru.userId();
      conn.sendBinary = test.stub();
      conn.added = test.stub();
      conn.changed = test.stub();
      conn.removed = test.stub();
      return conn;
    },

    mockSession (id="mock") {
      const sess = new MockSession(id);
      sess.globalDict = message.newGlobalDict();
      return sess;
    },

    mockSubscribe (v, id, name, ...args) {
      if (! v.conn) {
        v.conn = this.mockConnection(null, v.session);
        v.send = v.conn.ws.send;
      }
      var pub = v.session._commands.P;
      pub.call(v.conn, [id, name, args]);

      return v.conn._subs[id];
    },
  };

  module.exports = publishTH;
});
