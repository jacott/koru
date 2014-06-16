define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');
  var session = require('../session/base');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    'test removeRpc': function () {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});


      v.doc = TestModel.create({name: 'foo'});

      TestModel.onChange(v.afterRemove = test.stub());

      session._rpcs.remove.call({userId: 'u123'}, "TestModel", v.doc._id);

      refute(TestModel.findById(v.doc._id));

      assert.called(v.afterRemove);
      assert.calledWith(v.auth, "u123", {remove: true});
    },

    "test addUniqueIndex": function () {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addUniqueIndex('a', 'b', -1, 'c', 1, 'd');

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1}, {unique: true});
    },

    "test addIndex": function () {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addIndex('a', 'b', -1, 'c', 1, 'd');

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1});
    },
  });
});
