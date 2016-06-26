define(function (require, exports, module) {
  var test, v;
  const Driver  = require('koru/pg/driver');
  const koru    = require('../main');
  const session = require('../session/base');
  const util    = require('../util');
  const sut     = require('./db-broker');
  const Model   = require('./main');
  const TH      = require('./test-helper');
  const Val     = require('./validation');

  const Future   = util.Future;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      TH.noInfo();
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test dbBroker.db": function () {
      var TestModel = Model.define('TestModel');
      TestModel.defineFields({name: 'text'});
      var defDb = Driver.defaultDb;
      test.onEnd(revertTodefault);
      var altDb = Driver.connect(defDb._url + " options='-c search_path=alt'", 'alt');
      altDb.query('CREATE SCHEMA ALT');

      var obAny = TestModel.onAnyChange(v.anyChanged = test.stub());
      var obDef = TestModel.onChange(v.defChanged = test.stub());

      v.doc = TestModel.create({name: 'bar1'});
      v.doc = TestModel.create({name: 'bar2'});

      assert.calledTwice(v.defChanged);
      assert.calledTwice(v.anyChanged);
      v.defChanged.reset();
      v.anyChanged.reset();

      sut.db = altDb;

      var obAlt = TestModel.onChange(v.altChanged = test.stub());

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

      function revertTodefault() {
        obAny && obAny.stop();
        obDef && obDef.stop();
        obAlt && obAlt.stop();
        obDef = obAlt = obAny = null;
        if (altDb) {
          altDb.query("DROP SCHEMA alt CASCADE");
          sut.db = null;
          altDb = null;
        }
      }
    },
  });
});
