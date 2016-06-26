define(function (require, exports, module) {
  var test, v;
  const dbBroker = require('./db-broker');
  const Model    = require('./main');
  const TH       = require('./test-helper');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.obs = [];
      v.TestModel = Model.define('TestModel').defineFields({name: 'string', age: 'number', toys: 'object'});
      v.doc = v.TestModel.create({name: 'Fred', age: 5, toys: ['robot']});
    },

    tearDown: function () {
      v.obs.forEach(row => row.stop());
      Model._destroyModel('TestModel', 'drop');
      v = null;
      dbBroker.clearDbId();
    },

    "test observeIds": function () {
      var doc2 =  v.TestModel.create({name: 'Bob', age: 35});
      v.obs.push(v.ids = v.TestModel.observeIds([v.doc._id, doc2._id], v.ob = test.stub()));

      var doc3 = v.TestModel.create({name: 'Helen', age: 25});
      v.ids.replaceIds([v.doc._id, doc3._id]);

      doc3.age = 10;
      doc3.$$save();

      assert.calledWith(v.ob, TH.matchModel(doc3.$reload()), {age: 25});

      doc2.age = 10;
      doc2.$$save();

      refute.calledWith(v.ob, TH.matchModel(doc2.$reload()));
    },

    "test multi dbs": function () {
      var origId = v.dbId = dbBroker.dbId;
      test.intercept(dbBroker, 'dbId');
      Object.defineProperty(dbBroker, 'dbId', {configurable: true, get: function () {return v.dbId}});
      var oc = test.spy(v.TestModel, 'onChange');

      v.obs.push(v.TestModel.observeIds([v.doc._id], v.origOb = test.stub()));
      v.dbId = 'alt';
      assert.same(dbBroker.dbId, 'alt');

      assert.calledWith(oc, TH.match(func => v.oFunc = func));
      oc.reset();
      v.obs.push(v.altHandle = v.TestModel.observeIds([v.doc._id], v.altOb = test.stub()));
      assert.calledWith(oc, TH.match(func => v.altFunc = func));
      v.oFunc(v.doc, {name: 'old'});
      assert.calledWith(v.origOb, v.doc);
      refute.called(v.altOb);

      v.origOb.reset();
      v.altFunc(v.doc, {name: 'old'});
      assert.calledWith(v.altOb, v.doc);
      refute.called(v.origOb);

      v.dbId = origId;
      v.altHandle.stop();
      v.dbId = 'alt';

      v.altOb.reset();
      v.altFunc(v.doc, {name: 'old'});
      refute.called(v.altOb);

      oc.reset();
      v.obs.push(v.TestModel.observeIds([v.doc._id], v.altOb = test.stub()));
      v.obs.push(v.TestModel.observeIds([v.doc._id], v.altOb = test.stub()));
      assert.calledOnce(oc);
    },

    "test observeId changed": function () {
      v.obs.push(v.TestModel.observeId(v.doc._id, v.ob1 = test.stub()));
      v.obs.push(v.TestModel.observeId(v.doc._id, v.ob2 = test.stub()));

      v.doc.age = 17;
      v.doc.$$save();

      assert.calledWith(v.ob1, TH.matchModel(v.doc.$reload()), {age: 5});
      assert.calledWith(v.ob2, TH.matchModel(v.doc.$reload()), {age: 5});
    },

    "test observeId removed": function () {
      v.obs.push(v.TestModel.observeId(v.doc._id, v.ob = test.stub()));

      v.doc.$remove();

      assert.calledWith(v.ob, null, TH.matchModel(v.doc));
    },
  });
});
