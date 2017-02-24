isClient && define(function (require, exports, module) {
  /**
   * Support client side persistence using indexedDB
   *
   * For testing one can use {#koru/model/mockIndexedDB} in replacement of
   * `indexedDB`
   **/
  const Model         = require('koru/model');
  const mockIndexedDB = require('koru/model/mock-indexed-db');
  const api           = require('koru/test/api');
  const TH            = require('./test-helper');

  const QueryIDB = require('./query-idb');
  var v;

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
          assert.same(v.idb._version, 2);

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
          assert.same(v.idb._version, 2);
          this.onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
          v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
        }, () => {
          const iDoc = v.idb._store.TestModel.docs.foo123;
          assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

          v.f1.$update('age', 10);
        }, () => {
          const iDoc = v.idb._store.TestModel.docs.foo123;
          assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 10, gender: 'm'});

          v.f1.$remove();
        }, () => {
          const iDoc = v.idb._store.TestModel.docs.foo123;
          refute(iDoc);

          done();
        }]);
        // this results in the calls to queueChange below
      });
    },

    "test get"(done) {
      /**
       * Find a record from a {#koru/model/main} by its `_id`
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

});
