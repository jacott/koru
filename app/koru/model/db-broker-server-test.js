define(function (require, exports, module) {
  const koru    = require('koru/main');
  const Driver  = require('koru/pg/driver');
  const session = require('koru/session');
  const util    = require('koru/util');
  const Model   = require('./main');
  const TH      = require('./test-helper');
  const Val     = require('./validation');

  const {stub, spy, onEnd} = TH;

  const sut = require('./db-broker');

  const Future   = util.Future;

  let v = null;

  const revertTodefault = ()=>{
    v.obAny && v.obAny.stop();
    v.obDef && v.obDef.stop();
    v.obAlt && v.obAlt.stop();
    v.obDef = v.obAlt = v.obAny = null;
    if (v.altDb) {
      v.altDb.query("DROP SCHEMA alt CASCADE");
      sut.db = null;
      v.altDb = null;
    }
  };


  TH.testCase(module, {
    setUp() {
      v = {};
      TH.noInfo();
      v.TestModel = Model.define('TestModel');
      v.TestModel.defineFields({name: 'text'});
      v.defDb = Driver.defaultDb;
      onEnd(revertTodefault);
      v.altDb = Driver.connect(v.defDb._url + " options='-c search_path=alt'", 'alt');
      v.altDb.query('CREATE SCHEMA ALT');

      v.obAny = v.TestModel.onAnyChange(v.anyChanged = stub());
      v.obDef = v.TestModel.onChange(v.defChanged = stub());
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test dbBroker.db"() {
      const {TestModel, altDb, defDb} = v;
      v.doc = TestModel.create({name: 'bar1'});
      v.doc = TestModel.create({name: 'bar2'});

      assert.calledTwice(v.defChanged);
      assert.calledTwice(v.anyChanged);
      v.defChanged.reset();
      v.anyChanged.reset();

      sut.db = altDb;

      var obAlt = TestModel.onChange(v.altChanged = stub());

      assert.equals(TestModel.docs._client.query('show search_path'), [{search_path: "alt"}]);

      v.doc = TestModel.create({name: 'foo'});
      assert.same(TestModel.query.count(), 1);

      refute.called(v.defChanged);
      assert.calledWith(v.altChanged, v.doc);
      assert.calledWith(v.anyChanged, v.doc);

      sut.db = defDb;
      assert.same(TestModel.query.count(), 2);

      sut.db = altDb;
      assert.same(TestModel.query.count(), 1);

      revertTodefault();
      assert.same(TestModel.query.count(), 2);
    },

    "test makeFactory"() {
      class DBRunner {
        constructor(a, b) {this.db=sut.db; this.a = a; this.b = b}

        stop() {this.stopped = true}
      }

      const dbs = sut.makeFactory(DBRunner, 1, 2);

      const defRunner = dbs.current;

      assert.same(defRunner.a, 1);
      assert.same(defRunner.b, 2);


      assert.same(defRunner.constructor, DBRunner);
      assert.same(defRunner.db, v.defDb);

      sut.db = v.altDb;

      const altRunner = dbs.current;

      assert.same(altRunner.db, v.altDb);

      sut.db = v.defDb;

      assert.same(dbs.current, defRunner);

      assert.equals(Object.keys(dbs.list).sort(), ['alt', 'default']);

      assert.same(defRunner.stopped, undefined);

      dbs.stop();

      assert.equals(dbs.list, {});

      assert.isTrue(defRunner.stopped);
      assert.isTrue(altRunner.stopped);



    },
  });
});
