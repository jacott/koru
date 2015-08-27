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

    "test $remove": function () {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});

      TestModel.onChange(v.afterRemove = test.stub());

      var doc = TestModel.create({name: 'foo'});
      var spy = test.spy(session, "rpc");

      doc.$remove();

      assert.calledWith(spy, 'remove', 'TestModel', doc._id);

      refute(TestModel.findById(doc._id));

      assert.called(v.afterRemove);
    },

    "test create returns same as findById": function () {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});

      var doc = TestModel.create({name: 'foo'});
      assert.same(doc, TestModel.findById(doc._id));

    },

    "test transaction": function () {
      var TestModel = Model.define('TestModel');
      var stub = test.stub().returns('result');
      assert.same(TestModel.transaction(stub), 'result');

      assert.called(stub);
    },

  });
});
