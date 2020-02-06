define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const TransQueue      = require('koru/model/trans-queue');
  const Session         = require('koru/session');
  const message         = require('koru/session/message');
  const ServerConnection = require('koru/session/server-connection');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const {stub, spy} = TH;

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
      conn.onSubscribe = (...args)=> TransQueue.transaction(()=>{
        conn._session._commands.Q.call(conn, args);
        return conn._subs[args[0]];
      });

      return conn;
    },

    stopAllSubs: (conn) => {
      for (const id in conn._subs) {
        conn._subs[id].stop();
      }
    },

    decodeMessage,

    decodeEncodedCall: (conn, call)=>({
      type: String.fromCharCode(call.args[0][0]),
      data: decodeMessage(call.args[0], conn)}),


    hasEncodedCall: (conn, expType, expData)=>{
      cacheConn(conn);
      return hasEncodedCall(expType, expData);
    },

    listEncodedCalls: (conn, type)=>{
      cacheConn(conn);
      return cache.calls;
    },
  };

  const LINE_SEP = "\n   ";

  const callsToString = (calls)=> "Calls:"+LINE_SEP+calls.map(
    msg =>util.inspect(msg)).join(LINE_SEP);

  const cache = {
    sendEncoded: null, lastCall: null,
    calls: null, _callsString: null,
    get callsString() {
      return this._callsString || (this._callsString = callsToString(this.calls));
    }
  };

  const clearCache = ()=>{
    cache.sendEncoded = cache.lastCall = cache.calls = cache._callsString = null;
  };

  const cacheConn = (conn)=>{
    if (cache.sendEncoded !== conn.sendEncoded || cache.lastCall !== conn.sendEncoded.lastCall) {
      if (cache.sendEncoded === null) {
        TH.after(clearCache);
      }
      cache.sendEncoded = conn.sendEncoded; cache.lastCall = conn.sendEncoded.lastCall;
      cache.calls = [];
      if (conn.sendEncoded.calls !== void 0) for (const call of conn.sendEncoded.calls) {
        const {type, data} = ConnTH.decodeEncodedCall(conn, call);
        if (type === 'W') {
          cache.calls.push(...data);
        } else
          cache.calls.push([type, data]);
      }
    }
  };

  const hasEncodedCall = (expType, expData)=> cache.calls
        .some(msg => msg[0] === expType && util.deepEqual(msg[1], expData));


  TH.Core.assertions.add("encodedCall", {
    assert(conn, type, exp) {
      cacheConn(conn);
      const ans = hasEncodedCall(type, exp);
      if (ans === this._asserting)
        return ans;
      this.type = type;
      this.exp = exp;
      const calls = type === '' ? cache.calls : cache.calls.filter(call => call[0] === type);
      this.calls = calls.length == 0 ? "But was not called" : cache.callsString;
      return ans;
    },

    message: "sendEncoded to be called with {i$type} {i$exp}. {$calls}",
  });

  TH.Core.assertions.add("encodedCount", {
    assert(conn, count, type='') {
      cacheConn(conn);

      const calls = type === '' ? cache.calls : cache.calls.filter(call => call[0] === type);

      if ((calls.length == count) === this._asserting)
        return this._asserting;
      this.count = count;
      this.type = type;
      this.calls = (this.callCount = calls.length) == 0 ? "" : cache.callsString;

      return ! this._asserting;
    },

    message: "sendEncoded {$type} call count to be {$count} but was {$callCount}. {$calls}",
  });


  return ConnTH;
});
