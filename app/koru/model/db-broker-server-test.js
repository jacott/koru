isServer && define((require, exports, module) => {
  'use strict';
  /**
   * dbBroker allows for multiple databases to be connected to one nodejs instance
   **/
  const DocChange       = require('koru/model/doc-change');
  const Driver          = require('koru/pg/driver');
  const api             = require('koru/test/api');
  const Model           = require('./main');
  const TH              = require('./test-helper');
  const Val             = require('./validation');

  const {stub, spy} = TH;

  const sut = require('./db-broker');
  const dbBroker = sut;

  let v = {};

  const revertTodefault = async () => {
    v.obAny && v.obAny.stop();
    v.obDef && v.obDef.stop();
    v.obAlt && v.obAlt.stop();
    v.obDef = v.obAlt = v.obAny = null;
    if (v.altDb) {
      await v.altDb.query('DROP SCHEMA alt CASCADE');
      sut.db = null;
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
      v = {};
    });

    test('db', async () => {
      /**
       * The database for the current thread
       **/
      api.property();
      const {TestModel, altDb, defDb} = v;
      v.doc = await TestModel.create({name: 'bar1'});
      v.doc = await TestModel.create({name: 'bar2'});

      assert.calledTwice(v.defChanged);
      assert.calledTwice(v.anyChanged);
      v.defChanged.reset();
      v.anyChanged.reset();

      sut.db = altDb;

      const obAlt = TestModel.onChange(v.altChanged = stub());

      assert.equals(await TestModel.docs._client.query('show search_path'), [{search_path: 'alt'}]);

      v.doc = await TestModel.create({name: 'foo'});
      assert.same(await TestModel.query.count(), 1);

      refute.called(v.defChanged);
      assert.calledWith(v.altChanged, DocChange.add(v.doc));
      assert.calledWith(v.anyChanged, DocChange.add(v.doc));

      sut.db = defDb;
      assert.same(await TestModel.query.count(), 2);

      sut.db = altDb;
      assert.same(await TestModel.query.count(), 1);

      await revertTodefault();
      assert.same(await TestModel.query.count(), 2);
    });

    test('makeFactory', () => {
      /**
       * Make a factory that will create runners as needed for the current thread DB. Runners are
       * useful to keep state information on a per DB basis

       * @param {[any-type]} args arbitrary arguments to pass to the constructor
       **/
      api.method();
      const {defDb, altDb} = v;
      //[
      class DBRunner extends dbBroker.DBRunner {
        constructor(a, b) {
          super();
          this.a = a; this.b = b;
          this.hasStopped = false;
        }

        stopped() {this.hasStopped = true}
      }

      const DBS = sut.makeFactory(DBRunner, 1, 2);

      const defRunner = DBS.current;

      assert.same(defRunner.a, 1);
      assert.same(defRunner.b, 2);

      assert.same(defRunner.constructor, DBRunner);
      assert.same(defRunner.db, defDb);

      sut.db = altDb;

      const altRunner = DBS.current;

      assert.same(altRunner.db, altDb);

      sut.db = defDb;

      assert.same(DBS.current, defRunner);

      assert.equals(Object.keys(DBS.list).sort(), ['alt', 'default']);

      assert.isFalse(defRunner.hasStopped);

      DBS.stop();

      assert.equals(DBS.list, {});

      assert.isTrue(defRunner.hasStopped);
      assert.isTrue(altRunner.hasStopped);
      //]
    });
  });
});
