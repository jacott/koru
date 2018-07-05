define((require, exports, module)=>{
  const koru            = require('koru');
  const session         = require('koru/session');
  const message         = require('koru/session/message');
  const publish         = require('koru/session/publish');
  const SCFactory       = require('koru/session/server-connection-factory');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const {stub, spy, onEnd} = TH;

  const SessionBase = session.constructor;

  class MockSession extends SessionBase {
    constructor(id) {
      super(id);
      this._commands.P = session._commands.P;
    }
  }

  const publishTH = {
    mockConnection (sessId, session=this.mockSession()) {
      const conn = new (SCFactory(session))(
        {send: stub(), on: stub()}, {}, sessId || 's123', ()=>{}
      );
      spy(conn, 'batchMessages');
      spy(conn, 'releaseMessages');
      spy(conn, 'abortMessages');
      conn.userId = koru.userId();
      conn.sendBinary = stub();
      conn.added = stub();
      conn.changed = stub();
      conn.removed = stub();
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

  return publishTH;
});
