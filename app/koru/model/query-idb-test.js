isClient && define((require, exports, module)=>{
  /**
   * Support client side persistence using indexedDB
   *
   * For testing one can use {#koru/model/mockIndexedDB} in replacement of `indexedDB`
   **/
  const koru            = require('koru');
  const Model           = require('koru/model');
  const DocChange       = require('koru/model/doc-change');
  const mockIndexedDB   = require('koru/model/mock-indexed-db');
  const Query           = require('koru/model/query');
  const TH              = require('koru/model/test-db-helper');
  const TransQueue      = require('koru/model/trans-queue');
  const session         = require('koru/session');
  const {stopGap$}      = require('koru/symbols');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const {stub, spy, onEnd, match: m} = TH;

  const QueryIDB = require('./query-idb');
  const {IDBKeyRange} = window;

  let v = null;

  if (!QueryIDB.canIUse()) {
    TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
      test("not supported", ()=>{
        koru.info("Browser not supported");
        refute(QueryIDB.canIUse());
      });
    });
    return;
  }

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v = {};
      v.idb = new mockIndexedDB(1);
      v.TestModel = Model.define('TestModel').defineFields({
        name: 'text', age: 'number', gender: 'text'});
      api.module();
    });

    afterEach(()=>{
      Model._destroyModel('TestModel', 'drop');
      v = null;
    });

    test("whenReady", async ()=>{
      /**
       * Return a promise that is resolved when the DB is ready to query
       **/
      api.protoMethod();
      const db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      assert.isFalse(db.isReady);

      await db.whenReady();

      assert.isTrue(db.isReady);
    });

    test("whenIdle", async ()=>{
      /**
       * Return a promise that is resolved when the DB is ready and has commited all outstanding
       * updates.
       **/
      api.protoMethod();
      const db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      await db.whenReady();
      assert.isTrue(db.isIdle);

      db.put('TestModel', {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

      assert.isTrue(db.isReady);
      assert.isFalse(db.isIdle);

      await db.whenIdle();

      assert.isTrue(db.isIdle);
    });

    test("properties", ()=>{
      const db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      api.protoProperty('isReady', {intro() {
        /**
         * true if db has completed initializing and is not closed, otherwise false
         **/
      }});
      api.protoProperty('isIdle', {intro() {
        /**
         * true if db has completed initializing and is not closed and has no outstanding updates,
         * otherwise false
         **/
      }});
      assert.isFalse(db.isIdle);
      assert.isFalse(db.isReady);
    });

    test("constructor", async ()=>{
      /**
       * Open a indexedDB database
       *
       * @param {string} name the name of the database

       * @param {number} [version] expected version of database

       * @param {function} [upgrade] `function({db, oldVersion})`
       * where `db` is the `QueryIDB` instance and `oldVersion` is the
       * current version of the database
       **/
      const QueryIDB = api.class();
      let count = 0;
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db, oldVersion}) {
        assert.same(oldVersion, 1);
        db.createObjectStore("TestModel");
        ++count;
      }});

      assert.same(count, 0);

      await v.db.whenReady();
      assert.same(v.db.name, 'foo');
      assert.same(count, 1);
      ++count;
      assert.same(count, 2);
    });

    test("promisify", async ()=>{
      /**
       * perform a database action returning a promise
       *
       * @param {function} body the returns an `IDBRequest`

       * @returns {Promise}
       **/

      api.protoMethod('promisify');
      const db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      await db.whenReady();
      //[
      const id = await db.promisify(
        ()=>db.transaction(['TestModel'], 'readwrite')
          .objectStore('TestModel').put({_id: "id1", name: "foo"})
      );

      assert.equals(id, "id1");
      //]
    });

    group("queueChange", ()=>{
      /**
       * Queue a model change to update indexedDB when the current
       * {#trans-queue} successfully completes. Changes to model
       * instances with stopGap$ symbol true are ignored.
       *
       **/
      beforeEach(()=>{
        api.protoMethod();
        v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
          db.createObjectStore("TestModel");
        }});
      });

      test("simulated add, update", async ()=>{
        session.state.incPending();
        onEnd(()=>{session.state.pendingCount() == 1 && session.state.decPending()});

        await v.db.whenReady();
        //[
        {
          v.foo = v.idb._dbs.foo;
          assert.same(v.foo._version, 2);
          onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)));
          v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
          v.fIgnore = v.TestModel.createStopGap({
            _id: 'fooIgnore', name: 'foo ignore', age: 10, gender: 'f'});
        }
        await v.db.whenReady();
        {
          refute(v.foo._store.TestModel.docs.fooIgnore);
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, {
            _id: 'foo123', name: 'foo', age: 5, gender: 'm', $sim: ['del', undefined]});

          v.f1.$update('age', 10);
        }
        await v.db.whenReady();
        {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, {
            _id: 'foo123', name: 'foo', age: 10, gender: 'm', $sim: ['del', undefined]});

          v.f1.$remove();
        }
        await v.db.whenReady();
        {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, undefined);
        }
        //]
      });

      test("simulated remove", async ()=>{
        session.state.incPending();
        onEnd(_=> {session.state.decPending()});

        //[
        await v.db.whenReady(); {
          v.foo = v.idb._dbs.foo;
          assert.same(v.foo._version, 2);
          onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
          Query.insertFromServer(v.TestModel, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
          v.f1 = v.TestModel.findById('foo123');
        }
        await v.db.whenReady(); {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
          v.f1.$remove();
          await v.db.whenReady();
        }
        await v.db.whenReady(); {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, {_id: 'foo123', $sim: [{
            _id: 'foo123', name: 'foo', age: 5, gender: 'm'}, undefined]});
        }
        //]

        await v.db.whenReady();
      });

      test("non simulated", async ()=>{
        //[
        await v.db.whenReady(); {
          v.foo = v.idb._dbs.foo;
          assert.same(v.foo._version, 2);
          onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
          v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
          v.fIgnore = v.TestModel.createStopGap({
            _id: 'fooIgnore', name: 'foo ignore', age: 10, gender: 'f'});
        }
        await v.db.whenReady(); {
          refute(v.foo._store.TestModel.docs.fooIgnore);
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

          v.f1.$update('age', 10);
        }

        await v.db.whenReady(); {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, {_id: 'foo123', name: 'foo', age: 10, gender: 'm'});

          v.f1.$remove();
          await v.db.whenReady();
        }
        await v.db.whenReady(); {
          const iDoc = v.foo._store.TestModel.docs.foo123;
          assert.equals(iDoc, undefined);
        }
        //]

        await v.db.whenReady();
      });
    });

    group("loadDoc", ()=>{
      /**
       * Insert a record into a model but ignore #queueChange for same record and do nothing if
       * record already in model unless model[stopGap$] symbol is true;
       *
       * If record is simulated make from change from client point-of-view else server POV.
       **/
      let called, onChange;
      before(()=>{
        api.protoMethod('loadDoc');

        onChange = ()=>{
          called = false;
          onEnd(v.TestModel.onChange(dc => {
            v.db.queueChange(dc);
            called = true;
          }));
        };

        v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
          db.createObjectStore("TestModel");
        }});
      });

      beforeEach(()=>{
        called = false;
        v.simDocs = void 0;
        v.db.whenReady().then(()=>{
          v.simDocs = _=> Model._getProp(v.TestModel.dbId, 'TestModel', 'simDocs');
          session.state.incPending();
          onEnd(_=> {session.state.decPending()});
        });
        TH.startTransaction();
      });

      afterEach(()=>{
        TH.rollbackTransaction();
      });

      test("simulated insert", async ()=>{
        const {db, TestModel} = v;
        const mockIndexedDB = v.idb;
        await v.db.whenReady();
        api.example(onChange);
        //[#
        const rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm', $sim: ['del', undefined]};

        db.loadDoc('TestModel', rec);

        await db.whenReady();

        const {foo} = mockIndexedDB._dbs;
        const {foo123} = TestModel.docs;

        assert.same(foo123.attributes, rec);
        assert.same(rec.$sim, undefined);
        assert(called);

        assert.equals(v.simDocs(), {foo123: ['del', undefined]});
        //]
      });

      test("non simulated insert", async ()=>{
        await v.db.whenReady();
        onChange();
        v.TestModel.onChange(v.oc = stub());
        assert.isTrue(util.isObjEmpty(v.simDocs()));
        v.db.loadDoc('TestModel', v.rec = {
          _id: 'foo123', name: 'foo', age: 5, gender: 'm'});

        await v.db.whenReady();
        v.foo = v.idb._dbs.foo;

        const {foo123} = v.TestModel.docs;

        assert.same(foo123.attributes, v.rec);
        assert(called);

        assert.isTrue(util.isObjEmpty(v.simDocs()));

        assert.calledWith(v.oc, DocChange.add(foo123, 'idbLoad'));
      });

      test("simulated update", async ()=>{
        await v.db.whenReady();
        v.db.loadDoc('TestModel', {
          _id: 'foo123', name: 'foo2', age: 5, gender: 'f', $sim: [{name: 'foo'}, undefined]});
        await v.db.whenReady();

        const {foo123} = v.TestModel.docs;
        assert.equals(foo123.name, 'foo2');

        assert.equals(v.simDocs(), {
          foo123: [{name: 'foo'}, undefined]});
      });

      test("simulated remove", async ()=>{
        await v.db.whenReady();
        v.db.loadDoc('TestModel', {_id: 'foo123', $sim: [{
          _id: 'foo123', name: 'foo2', age: 5, gender: 'f'}, undefined]});
        await v.db.whenReady();

        assert.same(v.TestModel.docs.foo123, undefined);

        assert.equals(v.simDocs(), {
          foo123: [{_id: 'foo123', name: 'foo2', age: 5, gender: 'f'}, undefined]});
      });

      group("with stopGap$", ()=>{
        beforeEach(()=>{
          v.db.whenReady().then(()=>{
            Query.insertFromServer(v.TestModel, {
              _id: 'foo123', name: 'stopGap', age: 5, gender: 'm'});
            v.foo123 = v.TestModel.docs.foo123;
            v.foo123[stopGap$] = true;
          });
        });

        test("simulated update", async ()=>{
          await v.db.whenReady();
          v.TestModel.onChange(v.oc = stub());

          v.db.loadDoc('TestModel', {
            _id: 'foo123', name: 'foo2', age: 5, gender: 'f', $sim: [{name: 'foo'}, undefined]});
          await v.db.whenReady();

          assert.equals(v.foo123.name, 'foo2');

          assert.equals(v.simDocs(), {
            foo123: [{name: 'foo'}, undefined]});
          assert.equals(v.foo123[stopGap$], undefined);

          assert.calledWith(v.oc, DocChange.change(
            m.is(v.foo123), {name: 'stopGap', gender: 'm'}, undefined));
        });

        test("non simulated update", async ()=>{
          await v.db.whenReady();
          v.TestModel.onChange(v.oc = stub());

          v.db.loadDoc('TestModel', {_id: 'foo123', name: 'foo2', age: 5, gender: 'f'});
          await v.db.whenReady();

          assert.equals(v.foo123.name, 'foo2');

          assert.isTrue(util.isObjEmpty(v.simDocs()));

          assert.calledWith(v.oc, DocChange.change(
            m.is(v.foo123), {name: 'stopGap', gender: 'm'}, 'idbLoad'));
          assert.equals(v.foo123[stopGap$], undefined);
        });

        test("simulated remove", async ()=>{
          await v.db.whenReady();
          v.TestModel.onChange(v.oc = stub());
          v.db.loadDoc('TestModel', {_id: 'foo123', $sim: [{
            _id: 'foo123', name: 'foo2', age: 5, gender: 'f'}, undefined]});
          await v.db.whenReady();

          assert.same(v.TestModel.docs.foo123, undefined);

          assert.equals(v.simDocs(), {
            foo123: [{_id: 'foo123', name: 'foo2', age: 5, gender: 'f'}, undefined]});
          assert.equals(v.foo123[stopGap$], undefined);

          assert.calledWith(v.oc, DocChange.delete(v.foo123, undefined));
        });
      });


      test("stopGap$", async ()=>{
        await v.db.whenReady();
        session.state.incPending();
        onChange();
        onEnd(_=> {session.state.decPending()});

        v.db.loadDoc('TestModel', v.rec = {
          _id: 'foo123', name: 'foo', age: 5, gender: 'm'});

        await v.db.whenReady();
        v.foo = v.idb._dbs.foo;

        const {foo123} = v.TestModel.docs;

        assert.equals(v.foo._store.TestModel.docs, {});
        assert(called);

        called = false;
        v.db.loadDoc('TestModel', {_id: 'foo123', name: 'foo2', age: 5, gender: 'm'});
        await v.db.whenReady();
        assert.same(foo123.attributes, v.rec);
        assert.equals(foo123.name, 'foo');

        refute(called);
        v.TestModel.docs.foo123[stopGap$] = true;
        v.db.loadDoc('TestModel', {_id: 'foo123', name: 'foo2', age: 5, gender: 'm'});
        await v.db.whenReady();
        assert.equals(foo123.name, 'foo2');

        assert.same(v.TestModel.docs.foo123, foo123);
        assert.same(foo123.attributes, v.rec);
        assert.equals(foo123[stopGap$], undefined);

        assert(called);
      });
    });

    test("catchAll on open", ()=>{
      /**
       * Catch all errors from database actions
       **/
      const catchAll = stub();
      const open = spy(v.idb, 'open');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }, catchAll});

      const req = open.firstCall.returnValue;
      req.onerror('my error');

      assert.calledWith(catchAll, 'my error');
    });

    test("catchAll on put", async ()=>{
      const catchAll = stub();
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }, catchAll});
      await v.db.whenReady();

      const transaction = spy(v.idb._dbs.foo, 'transaction');

      v.db.put('TestModel', v.rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});

      assert.isFalse(v.db.isIdle);

      await v.db.whenReady();

      assert.calledOnceWith(transaction, ['TestModel'], 'readwrite');

      const t = transaction.firstCall.returnValue;

      t.oncomplete = null;
      const error = new Error('ev error');

      t.onerror(error);

      assert.isTrue(v.db.isReady);

      await v.db.whenReady();

      assert.calledWith(catchAll, error);
    });

    test("loadDocs", async ()=>{
      /**
       * Insert a list of records into a model. See {##loadDoc}
       **/
      const {TestModel} = v;
      const mockIndexeddb = v.idb;
      api.protoMethod('loadDocs');
      const db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      await db.whenReady();
      //[
      let called = false;
      TestModel.onChange(dc =>{db.queueChange(dc); called = true;});
      const recs = [
        {_id: 'foo123', name: 'foo', age: 5, gender: 'm'},
        {_id: 'foo456', name: 'bar', age: 10, gender: 'f'},
      ];
      db.loadDocs('TestModel', recs);
      await db.whenReady();
      const foo = v.idb._dbs.foo;

      assert.equals(TestModel.docs.foo123.attributes, recs[0]);
      assert.equals(TestModel.docs.foo456.attributes, recs[1]);
      assert.equals(foo._store.TestModel.docs, {});
      assert(called);
      //]
    });

    test("close", async ()=>{
      /**
       * Close a database. Once closed it may not be used anymore.
       **/
      api.protoMethod('close');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});

      v.db.close();
      v.db.put('TestModel', v.rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      const ready = stub();
      try {
        await v.db.whenReady().then(ready);
      } catch(ex) {v.ex = ex;}

      v.foo = v.idb._dbs.foo;
      assert.equals(v.foo._store.TestModel.docs, {});
      refute.called(ready);
      assert.equals(v.ex.message, 'DB closed');
    });

    test("put", async ()=>{
      /**
       * Insert or update a record in indexedDB
       **/
      api.protoMethod();
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      await v.db.whenReady();
      v.foo = v.idb._dbs.foo;
      TransQueue.transaction(() => {
        v.db.put('TestModel', v.rec = {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
        assert.same(v.foo._store.TestModel.docs.foo123, undefined);
      });
      await v.db.whenReady();
      assert.equals(v.foo._store.TestModel.docs.foo123, v.rec);
    });

    test("delete", async ()=>{
      /**
       * Delete a record from indexedDB
       **/
      api.protoMethod();
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      v.foo = v.idb._dbs.foo;
      await v.db.whenReady();
      v.foo._store.TestModel.docs = {
        foo123: {_id: 'foo123', name: 'foo', age: 5, gender: 'm'},
        foo456: {_id: 'foo456', name: 'foo 2', age: 10, gender: 'f'},
      };

      v.db.whenReady().then(() => {
        v.db.delete('TestModel', 'foo123');
      });
      await v.db.whenIdle();
      assert.equals(v.foo._store.TestModel.docs, {
        foo456: {_id: 'foo456', name: 'foo 2', age: 10, gender: 'f'}});
    });

    test("get", async ()=>{
      /**
       * Find a record in a {#koru/model/main} by its `_id`
       *
       **/
      api.protoMethod('get');

      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      await v.db.whenReady().then(() =>{
        onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
        v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
      });
      const doc = await v.db.whenReady().then(()=> v.db.get("TestModel", "foo123"));
      assert.equals(doc, {_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
    });

    test("getAll", async ()=>{
      /**
       * Find all records in a {#koru/model/main}
       *
       **/
      api.protoMethod('getAll');

      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel");
      }});
      await v.db.whenReady();
      onEnd(v.TestModel.onChange(v.db.queueChange.bind(v.db)).stop);
      TransQueue.transaction(() => {
        v.f1 = v.TestModel.create({_id: 'foo123', name: 'foo', age: 5, gender: 'm'});
        v.f2 = v.TestModel.create({_id: 'foo124', name: 'foo2', age: 10, gender: 'f'});
      });

      await v.db.whenReady();
      const docs = await v.db.getAll("TestModel");

      assert.equals(docs, [{
        _id: 'foo123', name: 'foo', age: 5, gender: 'm',
      }, {
        _id: 'foo124', name: 'foo2', age: 10, gender: 'f',
      }]);
    });

    group("with data", ()=>{
      beforeEach(()=>{
        v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
          db.createObjectStore("TestModel")
            .createIndex('name', 'name', {unique: false});
        }});
        v.db.whenReady().then(()=>{
          v.foo = v.idb._dbs.foo;

          v.t1 = v.foo._store.TestModel;
          v.t1.docs = {
            r2: v.r2 = {_id: 'r2', name: 'Ronald', age: 4},
            r1: v.r1 = {_id: 'r1', name: 'Ronald', age: 5},
            r3: v.r3 = {_id: 'r3', name: 'Allan', age: 3},
            r4: v.r4 = {_id: 'r4', name: 'Lucy', age: 7},
          };
        });
      });

      test("transaction", async ()=>{
        /**
         * Access to indexeddb transaction
         **/
        api.protoMethod('transaction');
        await v.db.whenReady();
        const t = v.db.transaction('TestModel', 'readwrite', v.opts = {
          oncomplete: stub(),
          onabort: stub(),
        });

        assert.same(t.oncomplete, v.opts.oncomplete);
        assert.same(t.onabort, v.opts.onabort);

        t.objectStore('TestModel').delete('r1');

        refute.called(v.opts.oncomplete);
        await v.db.whenReady();
        assert.called(v.opts.oncomplete);
      });

      test("count", async ()=>{
        /**
         * count records in a {#koru/model/main}
         *
         **/
        api.protoMethod('count');
        await v.db.whenReady();
        v.db.count('TestModel', IDBKeyRange.bound('r1', 'r4', false, true))
          .then(ans => v.ans = ans);

        await v.db.whenIdle();

        assert.same(v.ans, 3);
      });

      test("cursor", async ()=>{
        /**
         * Open cursor on an ObjectStore
         **/
        api.protoMethod('cursor');

        await v.db.whenReady();
        v.ans = [];
        v.db.cursor('TestModel', IDBKeyRange.bound('r1', 'r4', false, true), null, cursor => {
          if (cursor) {
            v.ans.push(cursor.value);
            cursor.continue();
          }
        });
        await v.db.whenReady();
        assert.equals(v.ans, [v.r1, v.r2, v.r3]);
      });

      test("Index", async ()=>{
        /**
         * Retreive a named index for an objectStore
         **/
        api.protoMethod('index');

        await v.db.whenReady();
        v.db.index("TestModel", "name")
          .getAll(IDBKeyRange.bound('Lucy', 'Ronald', false, true)).then(docs => v.ans = docs);

        v.db.index("TestModel", "name")
          .getAllKeys(IDBKeyRange.bound('Lucy', 'Ronald', false, true)).then(docs => v.ansKeys = docs);

        await v.db.whenIdle();
        assert.equals(v.ans, [v.r4]);
        assert.equals(v.ansKeys, ['r4']);

        v.db.index("TestModel", "name")
          .getAll().then(docs => v.ans = docs);

        v.db.index("TestModel", "name")
          .getAllKeys().then(docs => v.ansKeys = docs);

        await v.db.whenIdle();
        assert.equals(v.ans, [v.r3, v.r4, v.r1, v.r2]);
        assert.equals(v.ansKeys, ['r3', 'r4', 'r1', 'r2']);

        v.db.index("TestModel", "name")
          .count(IDBKeyRange.bound('Lucy', 'Ronald', false, false)).then(ans => v.ans = ans);

        await v.db.whenIdle();
        assert.equals(v.ans, 3);

        v.db.index("TestModel", "name")
          .get('Ronald').then(docs => v.ans = docs);

        await v.db.whenIdle();
        assert.equals(v.ans, v.r1);
      });

      test("index cursor", async ()=>{
        /**
         * Open a cursor on an index
         **/
        await v.db.whenReady();
        v.ans = [];
        v.db.index("TestModel", "name")
          .cursor(null, 'prev', cursor => {
            if (! cursor) return;
            v.ans.push(cursor.value);
            cursor.continue();
          });

        await v.db.whenReady();
        assert.equals(v.ans, [v.r2, v.r1, v.r4, v.r3]);
      });

      test("index keyCursor", async ()=>{
        /**
         * Open a keyCursor on an index
         **/
        await v.db.whenReady();
        v.ans = [];
        v.db.index("TestModel", "name")
          .keyCursor(null, 'prev', cursor => {
            if (! cursor) return;
            v.ans.push(cursor.primaryKey);
            cursor.continue();
          });

        await v.db.whenReady();
        assert.equals(v.ans, ['r2', 'r1', 'r4', 'r3']);
      });
    });

    test("deleteObjectStore", async ()=>{
      /**
       * Drop an objectStore and its indexes
       **/
      api.protoMethod('deleteObjectStore');
      v.db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel")
          .createIndex('name', 'name', {unique: false});
      }});
      await v.db.whenReady();
      v.foo = v.idb._dbs.foo;

      v.db.deleteObjectStore('TestModel');
      refute(v.foo._store.TestModel);
    });

    test("deleteDatabase", async ()=>{
      /**
       * delete an entire database
       **/
      const mockIndexeddb = v.idb;
      api.method('deleteDatabase');
      const db = new QueryIDB({name: 'foo', version: 2, upgrade({db}) {
        db.createObjectStore("TestModel")
          .createIndex('name', 'name', {unique: false});
      }});
      await db.whenReady();

      //[
      let done = false;
      QueryIDB.deleteDatabase('foo').then(() => done = true);

      await db.whenIdle();
      assert(done);
      //]
      refute(mockIndexeddb._dbs.foo);
    });
  });
});
