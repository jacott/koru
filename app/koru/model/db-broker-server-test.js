isServer && define((require, exports, module) => {
  'use strict';
  /**
   * dbBroker allows for multiple databases to be connected to one nodejs instance
   */
  const DocChange       = require('koru/model/doc-change');
  const Driver          = require('koru/pg/driver');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const Model           = require('./main');
  const TH              = require('./test-helper');
  const Val             = require('./validation');

  const {stub, spy} = TH;

  const dbBroker = require('./db-broker');

  let v = {};

  const revertTodefault = async () => {
    v.obAny?.stop();
    v.obDef?.stop();
    v.obAlt?.stop();
    v.obDef = v.obAlt = v.obAny = null;
    if (v.altDb != null) {
      await v.altDb.query('DROP SCHEMA alt CASCADE');
      v.altDb.end();
      dbBroker.db = null;
      v.altDb = null;
    }
  };

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    beforeEach(async () => {
      api.module({subjectName: 'dbBroker'});
      TH.noInfo();
      v.TestModel = Model.define('TestModel');
      v.TestModel.defineFields({name: 'text'});
      v.defDb = Driver.defaultDb;
      after(revertTodefault);
      v.altDb = await Driver.connect(v.defDb._url + " options='-c search_path=alt'", 'alt');
      await v.altDb.query('CREATE SCHEMA ALT');

      v.obAny = v.TestModel.onAnyChange(v.anyChanged = stub());
      v.obDef = v.TestModel.onChange(v.defChanged = stub());
    });

    afterEach(async () => {
      await Model._destroyModel('TestModel', 'drop');
      v.altDb?.end();
      v = {};
    });

    test('db', async () => {
      /**
       * The database for the current thread
       */
      api.property();
      const {TestModel, altDb, defDb} = v;
      v.doc = await TestModel.create({name: 'bar1'});
      v.doc = await TestModel.create({name: 'bar2'});

      assert.calledTwice(v.defChanged);
      assert.calledTwice(v.anyChanged);
      v.defChanged.reset();
      v.anyChanged.reset();

      dbBroker.db = altDb;

      const obAlt = TestModel.onChange(v.altChanged = stub());

      assert.equals(await TestModel.docs._client.query('show search_path'), [{search_path: 'alt'}]);

      v.doc = await TestModel.create({name: 'foo'});
      assert.same(await TestModel.query.count(), 1);

      refute.called(v.defChanged);
      assert.calledWith(v.altChanged, DocChange.add(v.doc));
      assert.calledWith(v.anyChanged, DocChange.add(v.doc));

      dbBroker.db = defDb;
      assert.same(await TestModel.query.count(), 2);

      dbBroker.db = altDb;
      assert.same(await TestModel.query.count(), 1);
      assert.same(dbBroker.dbId, 'alt');
      util.thread.dbId = 'changed';
      assert.same(dbBroker.dbId, 'changed');

      await revertTodefault();
      assert.same(await TestModel.query.count(), 2);
    });

    test('DBS.stop', () => {
      class DBRunner extends dbBroker.DBRunner {
        constructor(a) {
          super();
          this.a = a;
          this.hasStopped = false;
        }

        stopped() {
          ++DBS.current.a;
          this.hasStopped = true;
        }
      }

      const DBS = dbBroker.makeFactory(DBRunner, 0);

      assert.same(DBS.current.a, 0);
      assert.same(DBS.current.a, 0);

      DBS.stop();
      assert.same(DBS.current.a, 0); // this tests db-runner calles initDbs after running stop callbacks
    });

    test('makeFactory', () => {
      /**
       * Make a factory that will create runners as needed for the current thread DB. Runners are
       * useful to keep state information on a per DB basis

       * @param {[any-type]} args arbitrary arguments to pass to the constructor
       **/
      api.method();
      const {defDb, altDb} = v;
      dbBroker.db = defDb;
      //[
      class DBRunner extends dbBroker.DBRunner {
        constructor(a, b) {
          super();
          this.a = a;
          this.b = b;
          this.hasStopped = false;
        }

        stopped() {
          this.hasStopped = true;
        }
      }

      const DBS = dbBroker.makeFactory(DBRunner, 1, 2);

      let defRunner = DBS.current;

      assert.same(defRunner.a, 1);
      assert.same(defRunner.b, 2);

      assert.same(defRunner.constructor, DBRunner);
      assert.same(defRunner.db, defDb);

      dbBroker.db = altDb;

      let altRunner = DBS.current;

      assert.same(altRunner.db, altDb);

      dbBroker.db = defDb;

      assert.same(DBS.current, defRunner);

      assert.equals(Object.keys(DBS.list).sort(), ['alt', 'default']);

      assert.isFalse(defRunner.hasStopped);

      /// DBS.stop

      DBS.stop();

      assert.equals(DBS.list, {});

      assert.isTrue(defRunner.hasStopped);
      assert.isTrue(altRunner.hasStopped);

      /// DBS.remove

      dbBroker.db = altDb;
      altRunner = DBS.current;

      dbBroker.db = defDb;
      defRunner = DBS.current;
      assert.same(defRunner.db, defDb);
      defRunner.hasStopped = altRunner.hasStopped = false;

      assert.equals(Object.keys(DBS.list).sort(), ['alt', 'default']);

      DBS.remove('alt');

      assert.equals(Object.keys(DBS.list), ['default']);

      assert.isFalse(defRunner.hasStopped);
      assert.isTrue(altRunner.hasStopped);

      //]
    });
  });
});
