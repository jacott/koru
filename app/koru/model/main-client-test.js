define(function (require, exports, module) {
  'use strict';
  var test, v;
  const util     = require('koru/util');
  const session  = require('koru/session');
  const dbBroker = require('./db-broker');
  const Model    = require('./main');
  const TH       = require('./test-helper');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      dbBroker.clearDbId();
      delete Model._databases.foo1;
      v = null;
    },

    "test $remove"() {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});

      TestModel.onChange(v.afterRemove = test.stub());

      var doc = TestModel.create({name: 'foo'});
      var spy = test.spy(session, "rpc");

      doc.$remove();

      assert.calledWith(spy, 'remove', 'TestModel', doc._id);

      refute(TestModel.findById(doc._id));

      assert.called(v.afterRemove);
    },

    "test create returns same as findById"() {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});

      var doc = TestModel.create({name: 'foo'});
      assert.same(doc, TestModel.findById(doc._id));

    },

    "test $save with callback"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      const save = this.stub(session, 'rpc').withArgs('save');
      const doc = TestModel.build({name: 'foo'});
      doc.$save({callback: v.callback = this.stub()});

      assert.calledWith(save, 'save', 'TestModel', TH.match.id,
                        {_id: TH.match.id, name: 'foo'}, v.callback);
    },

    "test transaction"() {
      var TestModel = Model.define('TestModel');
      var stub = test.stub().returns('result');
      assert.same(TestModel.transaction(stub), 'result');

      assert.called(stub);
    },

    "test setting docs"() {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});
      v.idx = TestModel.addUniqueIndex('name');

      var foo1 = new TestModel({_id: 'foo1', name: 'Foo'});

      TestModel.docs = {foo1: foo1};

      var res = TestModel.query.withIndex(v.idx, 'Foo').fetch();

      assert.equals(res, [foo1]);
    },
  });
});
