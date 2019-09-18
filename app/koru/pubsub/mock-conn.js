define((require, exports, module)=>{
  'use strict';
  const session         = require('koru/session');
  const message         = require('koru/session/message');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const {stub, spy, onEnd, match: m} = TH;

  class MockConn {
    constructor(conn, gDict=session.globalDict) {
      this.conn = conn;
      this.gDict = gDict;
    }

    get sendEncoded() {return this.conn.sendEncoded}

    decodeMessage(msg) {
      return message.decodeMessage(msg.subarray(1), this.gDict);
    }

    decodeLastSend() {
      return this.decodeMessage(this.conn.sendEncoded.lastCall.args[0]);
    }

    findCall(type, exp, cb) {
      for (const call of this.sendEncoded.calls) {
        const msgs = this.decodeMessage(call.args[0]);
        for (const msg of msgs) {
          if (msg[0] === type && util.deepEqual(msg[1], exp))
            return true;
        }
        cb && cb(msgs.map(msg =>util.inspect(msg)).join("\n   ") || ' none');
      }
      return false;
    }

    assertAdded(doc) {
      const ans = [doc.constructor.modelName, doc.attributes];
      let msg;
      if (! this.findCall("A", ans, r =>{msg = r}))
        assert.fail("Expected " + util.inspect(ans) + " to be added. Found:\n   " +msg, 1);
    }

    refuteAdded(doc) {
      const ans = [doc.constructor.modelName, doc.attributes];
      this.findCall("A", ans) && assert.fail(
        "Did not expect "+util.inspect(ans) + " to be added", 1);
    }

    assertChange({doc, changes}) {
      const ans = [doc.constructor.modelName, doc._id, changes];
      let msg;
      if (!this.findCall("C", ans, r =>{msg = r}))
        assert.fail(
          "Expected " + util.inspect(ans) + " to be changed. Found:\n   " +msg, 1);
    }

    refuteChange({doc, changes}) {
      const ans = [doc.constructor.modelName, doc._id, changes];
      this.findCall("C", ans) && assert.fail(
        "Did not expect "+util.inspect(ans) + " to be changed", 1);
    }
  }

  return MockConn;
});
