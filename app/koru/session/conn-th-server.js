define((require, exports, module)=>{
  const koru            = require('koru');
  const Session         = require('koru/session');
  const message         = require('koru/session/message');
  const ServerConnection = require('koru/session/server-connection');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const {stub, spy, onEnd} = TH;

  const decodeMessage = (msg, conn)=> message.decodeMessage(
    msg.subarray(1), conn._session.globalDict);

  const ConnTH = {
    mockConnection(sessId='s123', session=Session) {
      const conn = new ServerConnection(session, {
        send: stub(), on: stub()}, {}, sessId, ()=>{}
      );
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

    stopAllSubs: (conn) => {
      for (const id in conn._subs) {
        conn._subs[id].stop();
      }
    },

    decodeEncodedCall: (conn, call)=>({
      type: String.fromCharCode(call.args[0][0]),
      data: decodeMessage(call.args[0], conn)}),


    hasEncodedCall: (conn, expType, expData)=>{
      if (conn.sendEncoded.calls !== void 0) for (const call of conn.sendEncoded.calls) {
        const {type, data} = ConnTH.decodeEncodedCall(conn, call);
        if (type === 'W') {
          for (const msg of data) {
          if (msg[0] === expType && util.deepEqual(msg[1], expData))
            return true;
          }
        } else if (type === expType && util.deepEqual(data, expData))
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

  const LINE_SEP = "\n   ";

  const callsToString = (calls)=> "Calls:"+LINE_SEP+calls.map(
    msg =>util.inspect(msg)).join(LINE_SEP);

  TH.Core.assertions.add("encodedCall", {
    assert(conn, type, exp) {
      this.type = type;
      this.exp = exp;
      const ans = ConnTH.hasEncodedCall(conn, type, exp);
      const calls = ConnTH.listEncodedCalls(conn, type);
      this.calls = calls.length == 0 ? "But was not called" : callsToString(calls);
      return ans;
    },

    message: "sendEncoded to be called with {i$type} {i$exp}. {$calls}",
  });

  TH.Core.assertions.add("encodedCount", {
    assert(conn, count, type) {
      this.count = count;
      this.type = type || '';
      const calls = ConnTH.listEncodedCalls(conn, type);
      this.calls = calls.length == 0 ? "" : callsToString(calls);

      return (this.callCount = calls.length) == count;
    },

    message: "sendEncoded {$type} call count to be {$count} but was {$callCount}. {$calls}",
  });


  return ConnTH;
});
