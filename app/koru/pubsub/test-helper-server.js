define((require, exports, module)=>{
  const koru            = require('koru');
  const Session         = require('koru/session');
  const message         = require('koru/session/message');
  const ServerConnection = require('koru/session/server-connection');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const {stub, spy, onEnd} = TH;


  const decodeMessage = (msg, conn)=> message.decodeMessage(msg.subarray(1), conn._session.globalDict);

  const PublishTH = {
    mockConnection(sessId='s123', session=Session) {
      const conn = new ServerConnection(session, {
        send: stub(), on: stub()}, {}, sessId, ()=>{}
      );
      spy(conn, 'batchMessages');
      spy(conn, 'releaseMessages');
      spy(conn, 'abortMessages');
      conn.userId = koru.userId();
      conn.sendBinary = stub();
      conn.sendEncoded = stub();
      conn.added = stub();
      conn.changed = stub();
      conn.removed = stub();
      conn.onSubscribe = (...args)=>{
        conn._session._commands.Q.call(conn, args);
        return conn._subs[args[0]];
      };

      return conn;
    },

    findEncodedCall: (conn, type, exp)=>{
      if (conn.sendEncoded.calls !== void 0) for (const call of conn.sendEncoded.calls) {
        const baseType = String.fromCharCode(call.args[0][0]);
        const msgs = decodeMessage(call.args[0], conn);
        if (baseType === 'W') {
          for (const msg of msgs) {
          if (msg[0] === type && util.deepEqual(msg[1], exp))
            return true;
          }
        } else if (baseType === type && util.deepEqual(msgs, exp))
          return true;
      }
      return false;
    },

    listEncodedCalls: (conn, type)=>{
      const ans = [];
      if (conn.sendEncoded.calls !== void 0) for (const call of conn.sendEncoded.calls) {
        const baseType = String.fromCharCode(call.args[0][0]);
        const msgs = decodeMessage(call.args[0], conn);
        if (baseType === 'W') {
          for (const msg of msgs) {
            if (msg[0] === type || type === void 0)
              ans.push(msg);
          }
        } else ans.push([baseType, msgs]);
      }
      return ans;
    },
  };

  TH.Core.assertions.add("encodedCall", {
    assert(conn, type, exp) {
      const ans = PublishTH.findEncodedCall(conn, type, exp);
      if (! this._asserting || ans) return ans;
      this.type = type;
      this.exp = exp;
      this.calls = PublishTH.listEncodedCalls(conn, type).map(
        msg =>util.inspect(msg)).join("\n   ") || 'not called';
      return ans;
    },

    assertMessage: "sendEncoded to be called with {i$type} {i$exp} but was\n   {$calls}",
    refuteMessage: "sendEncoded to be called with {i$type} {i$exp}",
  });

  return PublishTH;
});
