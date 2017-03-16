isClient && define(function (require, exports, module) {
  /**
   * IndexedDB queue for RPC messages to be sent. This queue is for a
   * persistent indexedDB queue which is suitable for offline support.
   *
   * Call {##reload} to re-populate the message queue when the app is
   * loaded and before other messages are preloaded.
   **/
  const MockIndexedDB = require('koru/model/mock-indexed-db');
  const QueryIDB      = require('koru/model/query-idb');
  const TH            = require('koru/test');
  const api           = require('koru/test/api');
  const MockPromise   = require('koru/test/mock-promise');

  const sut  = require('./rpc-idb-queue');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
      TH.stubProperty((isServer ? global : self), 'Promise', {value: MockPromise});
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test new"() {
      /**
       * Build a new queue
       **/
      const new_RPCIDBQueue = api.new();
      const db = new MockIndexedDB(0).open('foo', 0);

      const queue = new_RPCIDBQueue(db);

      assert.isFalse(queue.isRpcPending());
    },

    "with rpcQueue": {
      setUp() {
        v.mdb = new MockIndexedDB(0);
        v.db = new QueryIDB({name: 'foo', versoion: 0});
        poll();
        v.db.createObjectStore('rpcQueue', {keyPath: '_id'});
        v.fooDb = v.mdb._dbs.foo;
        v.os_rpcQueue = v.fooDb._store.rpcQueue;
        poll();
      },

      "test persistence"() {
        const queue = new sut(v.db);

        queue.push('a12', [{msg: 'the msg'}, function func() {}]);
        poll();
        assert.equals(v.os_rpcQueue.docs, {
          a12: {_id: 'a12', data: {msg: 'the msg'}}
        });
      },

      "test reload"() {
        /**
         * reload all waiting messages into memory for resend
         **/
        api.protoMethod('reload');
        v.os_rpcQueue.docs = {
          a12: {_id: 'a12', data: {msg: 'msg a12'}},
          a102: {_id: 'a102', data: {msg: 'msg a102'}},
          a2: {_id: 'a2', data: {msg: 'msg a2'}},
        };

        const ans = [];
        const queue = new sut(v.db);
        const state = {incPending: this.stub()};
        queue.reload({state}).then(() => {
          queue.resend({sendBinary(type, data) {
            assert.same(type, 'M');
            ans.push(data);
          }});
        });
        poll();

        assert.same(state.incPending.callCount, 3);
        assert.equals(ans, [{msg: 'msg a2'}, {msg: 'msg a12'}, {msg: 'msg a102'}]);
      },
    },
  });

  function poll() {v.mdb.yield(); Promise._poll();}
});
