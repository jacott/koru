isClient && define(function (require, exports, module) {
  /**
   * Support client side persistence using indexedDB
   *
   * For testing one can use {#koru/model/mockIndexedDB} in replacement of
   * `indexedDB`
   **/
  const koru          = require('koru');
  const Model         = require('koru/model');
  const mockIndexedDB = require('koru/model/mock-indexed-db');
  const TransQueue    = require('koru/model/trans-queue');
  const api           = require('koru/test/api');
  const MockPromise   = require('koru/test/mock-promise');
  const TH            = require('./test-helper');

  const QueryIDB = require('./query-idb');
  const {IDBKeyRange} = window;
  var v;

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
      v.TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number', gender: 'text'});
      api.module();
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
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
    },

    "test queueChange"(done) {
      /**
       * Queue a model change to happen when the current
       * {#trans-queue} successfully completes
       *
       * @param now the record in its current form

       * @param was the original values of the changes to the record.
       **/
      v.error = ex => done(ex);

      api.protoMethod('queueChange');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      v.idb.yield(0);

      api.example(() => {
        then([() => {
          v.foo = v.idb._dbs.foo;
          assert.same(v.foo._version, 2);
          this.onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
          v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
        }, () => {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

          v.f1.$update('age', 10);
        }, () => {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 10, gender: 'm'});

          v.f1.$remove();
        }, () => {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          refute(iDoc);

          done();
        }]);
        // this results in the calls to queueChange below
      });
    },

    "test loadDoc"() {
      /**
       * Insert a record into a model but ignore #queueChange for same
       * record and do nothing if record already in model;
       **/
      TH.stubProperty(window, 'Promise', {value: MockPromise});
      api.protoMethod('loadDoc');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      poll();
      v.TestModel.onChange((now, was) => {v.db.queueChange(now, was); v.called = true;});
      v.db.loadDoc('TestModel', v.rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      poll();
      v.foo = v.idb._dbs.foo;

      assert.equals(v.TestModel.docs.foo123.attributes, v.rec);
      assert.equals(v.foo._store.TestModel.docs, {});
      assert(v.called);
      v.called = false;
      v.db.loadDoc('TestModel', {_id: 'foo123', name: 'foo2', age: 5, gender: 'm'});
      poll();
      assert.equals(v.TestModel.docs.foo123.attributes, v.rec);
      refute(v.called);
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

      v.db.whenReady(() => {
        v.db.put('TestModel', v.rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      });
      poll();
      v.foo = v.idb._dbs.foo;
      assert.equals(v.foo._store.TestModel.docs.foo123, v.rec);
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
      poll();
      v.foo._store.TestModel.docs = {
        foo123: {_id: 'foo123', name: 'foo', age: 5, gender: 'm'},
        foo456: {_id: 'foo456', name: 'foo 2', age: 10, gender: 'f'},
      };

      v.db.whenReady(() => {
        v.db.delete('TestModel', 'foo123');
      });
      poll();
      assert.equals(v.foo._store.TestModel.docs, {foo456: {_id: 'foo456', name: 'foo 2', age: 10, gender: 'f'}});
    },

    "test get"(done) {
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
        this.onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
        v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

        v.db.get("TestModel", "foo123").then(doc => {
          try {
            assert.equals(doc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
            done();
          } catch(ex) {
            done(ex);
          }
        }).catch(v.error);
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
        this.onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
        TransQueue.transaction(() => {
          v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
          v.f2 = v.TestModel.create({_id: 'foo124', name: 'foo2', age: 10, gender: 'f'});
        });

        v.db.getAll("TestModel").then(docs => {
          try {
            assert.equals(docs, [{
              _id: 'foo123', name: 'foo', age: 5, gender: 'm',
            }, {
              _id: 'foo124', name: 'foo2', age: 10, gender: 'f',
            }]);
            done();
          } catch(ex) {
            done(ex);
          }
        }).catch(v.error);
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
        poll();
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
          oncomplete: this.stub(),
          onabort: this.stub(),
        });

        assert.same(t.oncomplete, v.opts.oncomplete);
        assert.same(t.onabort, v.opts.onabort);

        t.objectStore('TestModel').delete('r1');

        refute.called(v.opts.oncomplete);
        poll();
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

        poll();

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
        poll();
        assert.equals(v.ans, [v.r1, v.r2, v.r3]);
      },

      "test Index"() {
        /**
         * Retreive a named index for an objectStore
         **/
        api.protoMethod('index');

        v.db.index("TestModel", "name")
          .getAll(IDBKeyRange.bound('Lucy', 'Ronald', false, true)).then(docs => v.ans = docs);

        poll();
        assert.equals(v.ans, [v.r4]);

        v.db.index("TestModel", "name")
          .getAll().then(docs => v.ans = docs);

        poll();
        assert.equals(v.ans, [v.r3, v.r4, v.r1, v.r2]);

        v.db.index("TestModel", "name")
          .count(IDBKeyRange.bound('Lucy', 'Ronald', false, false)).then(ans => v.ans = ans);

        poll();
        assert.equals(v.ans, 3);

        v.db.index("TestModel", "name")
          .get('Ronald').then(docs => v.ans = docs);

        poll();
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

        poll();
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

        poll();
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
      poll();
      v.foo = v.idb._dbs.foo;

      v.db.deleteObjectStore('TestModel');
      refute(v.foo._store.TestModel);
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

  function poll() {v.idb.yield(); Promise._poll();}
});
