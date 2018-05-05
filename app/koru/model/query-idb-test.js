isClient && define(function (require, exports, module) {
  /**
   * Support client side persistence using indexedDB
   *
   * For testing one can use {#koru/model/mockIndexedDB} in replacement of `indexedDB`
   **/
  const koru          = require('koru');
  const Model         = require('koru/model');
  const mockIndexedDB = require('koru/model/mock-indexed-db');
  const Query         = require('koru/model/query');
  const TransQueue    = require('koru/model/trans-queue');
  const session       = require('koru/session');
  const {stopGap$}    = require('koru/symbols');
  const api           = require('koru/test/api');
  const MockPromise   = require('koru/test/mock-promise');
  const TH            = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const QueryIDB = require('./query-idb');
  const {IDBKeyRange} = window;

  let v = null;

  if (!QueryIDB.canIUse()) {
    TH.testCase(module, {
      "test not supported"() {
        koru.info("Browser not supported");
        refute(QueryIDB.canIUse());
      },
    });
    return;
  }

  TH.testCase(module, {
    setUp() {
      v = {};
      v.idb = new mockIndexedDB(1);
      v.TestModel = Model.define('TestModel').defineFields({
        name: 'text', age: 'number', gender: 'text'});
      api.module();
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      MockPromise._stop();
      v = null;
    },

    "test new"(done) {
      /**
       * Open a indexedDB database
       *
       * @param {string} name the name of the database

       * @param {number} [version] expected version of database

       * @param {function} [upgrade] `function({db, oldVersion})`
       * where `db` is the `QueryIDB` instance and `oldVersion` is the
       * current version of the database
       **/
      v.error = ex => done(ex);

      const new_QueryIDB = api.new(QueryIDB);
      api.example(() => {
        v.db = new_QueryIDB({name: 'foo', version: 2, upgrade({db, oldVersion}) {
          assert.same(oldVersion, 1);
          db.createObjectStore("TestModel");
        }});

        v.db.whenReady(() => {
          done();
        });
      });
      v.idb.yield(0);

      assert.same(v.db.name, 'foo');
    },

    "test promisify"() {
      /**
       * perform a database action returning a promise
       *
       * @param {function} body the returns an `IDBRequest`

       * @returns {Promise}
       **/

      api.protoMethod('promisify');
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      const db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      flush();
      api.example(()=>{
        let id;
        const promise = db.promisify(
          ()=>db.transaction(['TestModel'], 'readwrite')
            .objectStore('TestModel').put({_id: "id1", name: "foo"})
        ).then(v => {id = v});
        flush();
        assert.equals(id, "id1");
      });
    },

    "queueChange": {
      setUp() {
        /**
         * Queue a model change to update indexedDB when the current
         * {#trans-queue} successfully completes. Changes to model
         * instances with stopGap$ symbol true are ignored.
         *
         * @param now the record in its current form

         * @param was the original values of the changes to the record.
         **/
        api.protoMethod('queueChange');
        TH.stubProperty(window, 'Promise', {value: MockPromise});
        v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
          db.createObjectStore("TestModel");
        }});
      },

      "test simulated add, update"() {
        session.state.incPending();
        onEnd(_=> {session.state.decPending()});

        api.example(() => {
          flush(); {
            v.foo = v.idb._dbs.foo;
            assert.same(v.foo._version, 2);
            onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
            v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
            v.fIgnore = v.TestModel.createStopGap({
              _id: 'fooIgnore', name: 'foo ignore', age: 10, gender: 'f'});
          }
          flush(); {
            refute(v.foo._store.TestModel.docs.fooIgnore);
            const iDoc = v.foo._store.TestModel.docs.foo123;
            assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm', $sim: 'new'});

            v.f1.$update('age', 10);
            flush();
          }
          flush(); {
            const iDoc = v.foo._store.TestModel.docs.foo123;
            assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 10, gender: 'm', $sim: 'new'});

            v.f1.$remove();
            flush();
          }
          flush(); {
            const iDoc = v.foo._store.TestModel.docs.foo123;
            assert.equals(iDoc, undefined);
          }
          // this results in the calls to queueChange below
        });

        flush();
      },

      "test simulated remove"() {
        session.state.incPending();
        onEnd(_=> {session.state.decPending()});

        api.example(() => {
          flush(); {
            v.foo = v.idb._dbs.foo;
            assert.same(v.foo._version, 2);
            onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
            Query.insertFromServer(v.TestModel, 'foo123', {name: 'foo', age: 5, gender: 'm'});
            v.f1 = v.TestModel.findById('foo123');
          }
          flush(); {
            const iDoc = v.foo._store.TestModel.docs.foo123;
            assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
            v.f1.$remove();
            flush();
          }
          flush(); {
            const iDoc = v.foo._store.TestModel.docs.foo123;
            assert.equals(iDoc, {_id: 'foo123', $sim: {
              _id: 'foo123', name: 'foo', age: 5, gender: 'm'}});
          }
          // this results in the calls to queueChange below
        });

        flush();
      },

      "test non simulated"() {
        api.example(() => {
          flush(); {
            v.foo = v.idb._dbs.foo;
            assert.same(v.foo._version, 2);
            onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
            v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
            v.fIgnore = v.TestModel.createStopGap({
              _id: 'fooIgnore', name: 'foo ignore', age: 10, gender: 'f'});
          }
          flush(); {
            refute(v.foo._store.TestModel.docs.fooIgnore);
            const iDoc = v.foo._store.TestModel.docs.foo123;
            assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

            v.f1.$update('age', 10);
          }

          flush(); {
            const iDoc = v.foo._store.TestModel.docs.foo123;
            assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 10, gender: 'm'});

            v.f1.$remove();
            flush();
          }
          flush(); {
            const iDoc = v.foo._store.TestModel.docs.foo123;
            assert.equals(iDoc, undefined);
          }
          // this results in the calls to queueChange below
        });

        flush();
      },
    },

    "loadDoc": {
      setUp() {
        /**
         * Insert a record into a model but ignore #queueChange for same record and do nothing if
         * record already in model unless model[stopGap$] symbol is true;
         *
         * If record is simulated make from change from client point-of-view else server POV.
         **/
        TH.stubProperty(window, 'Promise', {value: MockPromise});
        api.protoMethod('loadDoc');
        v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
          db.createObjectStore("TestModel");
        }});
        flush();
        v.TestModel.onChange((now, was) => {v.db.queueChange(now, was); v.called = true;});
        v.simDocs = _=> Model._getProp(v.TestModel.dbId, 'TestModel', 'simDocs');
        session.state.incPending();
        onEnd(_=> {session.state.decPending()});
      },

      "test simulated insert"() {
        v.db.loadDoc('TestModel', v.rec = {
          _id: 'foo123', name: 'foo', age: 5, gender: 'm', $sim: 'new'});

        flush();
        v.foo = v.idb._dbs.foo;

        const {foo123} = v.TestModel.docs;

        assert.same(foo123.attributes, v.rec);
        assert.same(v.rec.$sim, undefined);
        assert(v.called);

        assert.equals(v.simDocs(), {foo123: 'new'});
      },

      "test non simulated insert"() {
        v.TestModel.onChange(v.oc = stub());
        assert.equals(v.simDocs(), undefined);
        v.db.loadDoc('TestModel', v.rec = {
          _id: 'foo123', name: 'foo', age: 5, gender: 'm'});

        flush();
        v.foo = v.idb._dbs.foo;

        const {foo123} = v.TestModel.docs;

        assert.same(foo123.attributes, v.rec);
        assert(v.called);

        assert.equals(v.simDocs(), undefined);

        assert.calledWith(v.oc, foo123, null, true);
      },

      "test simulated update"() {
        v.db.loadDoc('TestModel', {
          _id: 'foo123', name: 'foo2', age: 5, gender: 'f', $sim: {name: 'foo'}});
        flush();

        const {foo123} = v.TestModel.docs;
        assert.equals(foo123.name, 'foo2');

        assert.equals(v.simDocs(), {
          foo123: {name: 'foo'}});
      },

      "test simulated remove"() {
        v.db.loadDoc('TestModel', {_id: 'foo123', $sim: {
          _id: 'foo123', name: 'foo2', age: 5, gender: 'f'}});
        flush();

        assert.same(v.TestModel.docs.foo123, undefined);

        assert.equals(v.simDocs(), {
          foo123: {_id: 'foo123', name: 'foo2', age: 5, gender: 'f'}});
      },

      "with stopGap$": {
        setUp() {
          Query.insertFromServer(v.TestModel, 'foo123', {
            _id: 'foo123', name: 'stopGap', age: 5, gender: 'm'});
          v.foo123 = v.TestModel.docs.foo123;
          v.foo123[stopGap$] = true;
        },

        "test simulated update"() {
          v.db.loadDoc('TestModel', {
            _id: 'foo123', name: 'foo2', age: 5, gender: 'f', $sim: {name: 'foo'}});
          flush();

          assert.equals(v.foo123.name, 'foo2');

          assert.equals(v.simDocs(), {
            foo123: {name: 'foo'}});
          assert.equals(v.foo123[stopGap$], undefined);
        },

        "test non simulated update"() {
          v.TestModel.onChange(v.oc = stub());

          v.db.loadDoc('TestModel', {_id: 'foo123', name: 'foo2', age: 5, gender: 'f'});
          flush();


          assert.equals(v.foo123.name, 'foo2');

          assert.equals(v.simDocs(), undefined);

          assert.calledWith(v.oc, v.foo123, {name: 'stopGap', gender: 'm'}, true);
          assert.equals(v.foo123[stopGap$], undefined);
        },

        "test simulated remove"() {
          v.db.loadDoc('TestModel', {_id: 'foo123', $sim: {
            _id: 'foo123', name: 'foo2', age: 5, gender: 'f'}});
          flush();

          assert.same(v.TestModel.docs.foo123, undefined);

          assert.equals(v.simDocs(), {
            foo123: {_id: 'foo123', name: 'foo2', age: 5, gender: 'f'}});
          assert.equals(v.foo123[stopGap$], undefined);
        },
      },


      "test stopGap$"() {
        session.state.incPending();
        onEnd(_=> {session.state.decPending()});

        v.db.loadDoc('TestModel', v.rec = {
          _id: 'foo123', name: 'foo', age: 5, gender: 'm'});

        flush();
        v.foo = v.idb._dbs.foo;

        const {foo123} = v.TestModel.docs;

        assert.equals(v.foo._store.TestModel.docs, {});
        assert(v.called);

        v.called = false;
        v.db.loadDoc('TestModel', {_id: 'foo123', name: 'foo2', age: 5, gender: 'm'});
        flush();
        assert.same(foo123.attributes, v.rec);
        assert.equals(foo123.name, 'foo');

        refute(v.called);
        v.TestModel.docs.foo123[stopGap$] = true;
        v.db.loadDoc('TestModel', {_id: 'foo123', name: 'foo2', age: 5, gender: 'm'});
        flush();
        assert.equals(foo123.name, 'foo2');

        assert.same(v.TestModel.docs.foo123, foo123);
        assert.same(foo123.attributes, v.rec);
        assert.equals(foo123[stopGap$], undefined);

        assert(v.called);
      },
    },

    "test catchAll on open"() {
      /**
       * Catch all errors from database actions
       **/
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      const catchAll = stub();
      const open = spy(v.idb, 'open');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }, catchAll});

      const req = open.firstCall.returnValue;
      req.onerror('my error');

      assert.calledWith(catchAll, 'my error');
    },

    "test catchAll on put"() {
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      const catchAll = stub();
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }, catchAll});
      flush();

      const transaction = spy(v.idb._dbs.foo, 'transaction');

      v.db.put('TestModel', v.rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

      v.db.whenReady().catch(v.catch = stub());
      poll();

      assert.calledOnceWith(transaction, ['TestModel'], 'readwrite');

      const t = transaction.firstCall.returnValue;

      t.oncomplete = null;
      const error = new Error('ev error');
      assert.isFalse(v.db.isReady);

      t.onabort({currentTarget: {error}});

      assert.isTrue(v.db.isReady);

      flush();

      assert.calledWith(catchAll, error);
      assert.calledWith(v.catch, error);
    },

    "test loadDocs"() {
      /**
       * Insert a list of records into a model. See {##loadDoc}
       **/
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      api.protoMethod('loadDocs');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      flush();
      v.TestModel.onChange((now, was) => {v.db.queueChange(now, was); v.called = true;});
      v.db.loadDocs('TestModel', v.recs = [
        {_id: 'foo123', name: 'foo', age: 5, gender: 'm'},
        {_id: 'foo456', name: 'bar', age: 10, gender: 'f'},
      ]);
      flush();
      v.foo = v.idb._dbs.foo;

      assert.equals(v.TestModel.docs.foo123.attributes, v.recs[0]);
      assert.equals(v.TestModel.docs.foo456.attributes, v.recs[1]);
      assert.equals(v.foo._store.TestModel.docs, {});
      assert(v.called);
    },

    "test close"() {
      /**
       * Close a database. Once closed it may not be used anymore.
       **/
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      api.protoMethod('close');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});

      v.db.close();
      v.db.put('TestModel', v.rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      const ready = stub();
      v.db.whenReady(ready).catch(ex => v.ex = ex);
      flush();
      v.foo = v.idb._dbs.foo;
      assert.equals(v.foo._store.TestModel.docs, {});
      refute.called(ready);
      assert.equals(v.ex.message, 'DB closed');
    },

    "test put"() {
      /**
       * Insert or update a record in indexedDB
       **/
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      api.protoMethod('put');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});

      v.foo = v.idb._dbs.foo;
      v.db.put('TestModel', v.rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      refute(v.foo._store.TestModel);
      v.db.whenReady(()=>{
        assert.equals(v.foo._store.TestModel.docs.foo123, v.rec);
        v.success = true;
      });
      refute(v.success);
      flush();
      assert(v.success);
    },

    "test delete"() {
      /**
       * Insert or update a record in indexedDB
       **/
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      api.protoMethod('put');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      v.foo = v.idb._dbs.foo;
      flush();
      v.foo._store.TestModel.docs = {
        foo123: {_id: 'foo123', name: 'foo', age: 5, gender: 'm'},
        foo456: {_id: 'foo456', name: 'foo 2', age: 10, gender: 'f'},
      };

      v.db.whenReady(() => {
        v.db.delete('TestModel', 'foo123');
      });
      flush();
      assert.equals(v.foo._store.TestModel.docs, {
        foo456: {_id: 'foo456', name: 'foo 2', age: 10, gender: 'f'}});
    },

    "test get."(done) {
      /**
       * Find a record in a {#koru/model/main} by its `_id`
       *
       **/
      v.error = ex => done(ex);
      api.protoMethod('get');

      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      v.idb.yield(0);
      v.db.whenReady(() => {
        v.idb.yield(0);
        onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
        v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

        v.db.whenReady(()=> v.db.get("TestModel", "foo123").then(doc => {
          try {
            assert.equals(doc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
            done();
          } catch(ex) {
            done(ex);
          }
        }).catch(v.error));
        v.idb.yield(0);
      }).catch(v.error);
    },

    "test getAll"(done) {
      /**
       * Find all records in a {#koru/model/main}
       *
       **/
      v.error = ex => done(ex);
      api.protoMethod('getAll');

      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      v.idb.yield(0);
      v.db.whenReady(() => {
        v.idb.yield(0);
        onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
        TransQueue.transaction(() => {
          v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
          v.f2 = v.TestModel.create({_id: 'foo124', name: 'foo2', age: 10, gender: 'f'});
        });

        v.db.whenReady(()=> v.db.getAll("TestModel").then(docs => {
          assert.equals(docs, [{
            _id: 'foo123', name: 'foo', age: 5, gender: 'm',
          }, {
            _id: 'foo124', name: 'foo2', age: 10, gender: 'f',
          }]);
          done();
        })).catch(v.error);
        v.idb.yield(0);
      }).catch(v.error);
    },

    "with data": {
      setUp() {
        TH.stubProperty(window, 'Promise', {value: MockPromise});

        v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
          db.createObjectStore("TestModel")
            .createIndex('name', 'name', {unique: false});
        }});
        flush();
        v.foo = v.idb._dbs.foo;

        v.t1 = v.foo._store.TestModel;
        v.t1.docs = {
          r2: v.r2 = {_id: 'r2', name: 'Ronald', age: 4},
          r1: v.r1 = {_id: 'r1', name: 'Ronald', age: 5},
          r3: v.r3 = {_id: 'r3', name: 'Allan', age: 3},
          r4: v.r4 = {_id: 'r4', name: 'Lucy', age: 7},
        };
      },

      "test transaction"() {
        /**
         * Access to indexeddb transaction
         **/
        api.protoMethod('transaction');
        const t = v.db.transaction('TestModel', 'readwrite', v.opts = {
          oncomplete: stub(),
          onabort: stub(),
        });

        assert.same(t.oncomplete, v.opts.oncomplete);
        assert.same(t.onabort, v.opts.onabort);

        t.objectStore('TestModel').delete('r1');

        refute.called(v.opts.oncomplete);
        flush();
        assert.called(v.opts.oncomplete);
      },

      "test count"() {
        /**
         * count records in a {#koru/model/main}
         *
         **/
        api.protoMethod('count');

        v.db.count('TestModel', IDBKeyRange.bound('r1', 'r4', false, true))
          .then(ans => v.ans = ans);

        flush();

        assert.same(v.ans, 3);
      },

      "test cursor"() {
        /**
         * Open cursor on an ObjectStore
         **/
        api.protoMethod('cursor');

        v.ans = [];
        v.db.cursor('TestModel', IDBKeyRange.bound('r1', 'r4', false, true), null, cursor => {
          if (cursor) {
            v.ans.push(cursor.value);
            cursor.continue();
          }
        });
        flush();
        assert.equals(v.ans, [v.r1, v.r2, v.r3]);
      },

      "test Index"() {
        /**
         * Retreive a named index for an objectStore
         **/
        api.protoMethod('index');

        v.db.index("TestModel", "name")
          .getAll(IDBKeyRange.bound('Lucy', 'Ronald', false, true)).then(docs => v.ans = docs);

        v.db.index("TestModel", "name")
          .getAllKeys(IDBKeyRange.bound('Lucy', 'Ronald', false, true)).then(docs => v.ansKeys = docs);

        flush();
        assert.equals(v.ans, [v.r4]);
        assert.equals(v.ansKeys, ['r4']);

        v.db.index("TestModel", "name")
          .getAll().then(docs => v.ans = docs);

        v.db.index("TestModel", "name")
          .getAllKeys().then(docs => v.ansKeys = docs);

        flush();
        assert.equals(v.ans, [v.r3, v.r4, v.r1, v.r2]);
        assert.equals(v.ansKeys, ['r3', 'r4', 'r1', 'r2']);

        v.db.index("TestModel", "name")
          .count(IDBKeyRange.bound('Lucy', 'Ronald', false, false)).then(ans => v.ans = ans);

        flush();
        assert.equals(v.ans, 3);

        v.db.index("TestModel", "name")
          .get('Ronald').then(docs => v.ans = docs);

        flush();
        assert.equals(v.ans, v.r1);
      },

      "test index cursor"() {
        /**
         * Open a cursor on an index
         **/
        v.ans = [];
        v.db.index("TestModel", "name")
          .cursor(null, 'prev', cursor => {
            if (! cursor) return;
            v.ans.push(cursor.value);
            cursor.continue();
          });

        flush();
        assert.equals(v.ans, [v.r2, v.r1, v.r4, v.r3]);
      },

      "test index keyCursor"() {
        /**
         * Open a keyCursor on an index
         **/
        v.ans = [];
        v.db.index("TestModel", "name")
          .keyCursor(null, 'prev', cursor => {
            if (! cursor) return;
            v.ans.push(cursor.primaryKey);
            cursor.continue();
          });

        flush();
        assert.equals(v.ans, ['r2', 'r1', 'r4', 'r3']);
      },
    },

    "test deleteObjectStore"() {
      /**
       * Drop an objectStore and its indexes
       **/
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      api.protoMethod('deleteObjectStore');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel")
          .createIndex('name', 'name', {unique: false});
      }});
      flush();
      v.foo = v.idb._dbs.foo;

      v.db.deleteObjectStore('TestModel');
      refute(v.foo._store.TestModel);
    },

    "test deleteDatabase"() {
       /**
       * delete an entire database
       **/
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      api.method('deleteDatabase');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel")
          .createIndex('name', 'name', {unique: false});
      }});
      flush();
      v.foo = v.idb._dbs.foo;

      QueryIDB.deleteDatabase('foo').then(() => v.done = true);
      flush();
      assert(v.done);
      refute(v.idb._dbs.foo);
    },
  });

  function then(queue, idx=0) {
    v.db.whenReady(() => {
      if (! (v && queue[idx])) return;
      queue[idx]();
      if (! v) return;
      v.idb.yield(0);
      then(queue, idx+1);
    }).catch(v.error);
  }

  const flush = (max=10)=>{
    v.idb.yield();
    while (--max >= 0 && Promise._pendingCount() > 0) {
      Promise._poll(); v.idb.yield();
    }
  };

  const poll = ()=>{
    v.idb.yield();
    Promise._poll();
  };
});
