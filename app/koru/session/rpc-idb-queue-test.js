isClient && define(function (require, exports, module) {
  /**
   * IndexedDB queue for RPC messages to be sent. This queue is for a
   * persistent indexedDB queue which is suitable for offline support.
   *
   * Call {##reload} to re-populate the message queue when the app is
   * loaded and before other messages are preloaded.
   *
   * RpcGet methods are not persisted.
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

        const session = {isRpcGet() {return false}};
        function func() {}

        queue.push(session, v.data = ['a12', 'foo', 1], func);
        poll();
        assert.equals(v.os_rpcQueue.docs, {
          a12: {_id: 'a12', data: ['a12', 'foo', 1]}
        });
        assert.equals(queue.get('a12'), [v.data, func]);
      },

      "test get not persisted"() {
        const queue = new sut(v.db);

        const session = {isRpcGet(arg) {return arg === 'foo'}};

        function func() {}

        queue.push(session, v.data = ['a12', 'foo', 1], func);
        poll();
        assert.equals(v.os_rpcQueue.docs, {});
        assert.equals(queue.get('a12'), [v.data, func]);

      },

      "test reload"() {
        /**
         * reload all waiting messages into memory for resend
         **/
        api.protoMethod('reload');
        v.os_rpcQueue.docs = {
          a12: {_id: 'a1212345670123456789', data: ['a1212345670123456789', 'foo1']},
          a102: {_id: 'a10212345670123456789', data: ['a10212345670123456789', 'foo2']},
          a2: {_id: 'a212345670123456789', data: ['a212345670123456789', 'foo3']},
        };

        const ans = [];
        const queue = new sut(v.db);
        const state = {incPending: this.stub()};
        const sess = {
          _msgId: 0, state,
          sendBinary(type, data) {
            assert.same(type, 'M');
            ans.push(data);
          }
        };
        queue.reload(sess).then(() => {queue.resend(sess)});
        poll();
        assert.same(sess._msgId.toString(36), 'a102');

        assert.same(state.incPending.callCount, 3);
        assert.calledWith(state.incPending, true);
        assert.equals(ans, [
          ['a212345670123456789', 'foo3'],
          ['a1212345670123456789', 'foo1'],
          ['a10212345670123456789', 'foo2']]);
      },
    },
  });

  function poll() {v.mdb.yield(); Promise._poll();}
});
