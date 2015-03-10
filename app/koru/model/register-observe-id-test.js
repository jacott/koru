define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.obs = [];
      v.TestModel = Model.define('TestModel').defineFields({name: 'string', age: 'number', toys: 'object'});
      v.doc = v.TestModel.create({name: 'Fred', age: 5, toys: ['robot']});
    },

    tearDown: function () {
      for(var i = 0; i < v.obs.length; ++i) {
        var row = v.obs[i];
        row.stop();
      }
      Model._destroyModel('TestModel', 'drop');
      v = null;
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
