define(function (require, exports, module) {
  'use strict';
  const Val        = require('koru/model/validation');
  const session    = require('koru/session');
  const {stopGap$} = require('koru/symbols');
  const api        = require('koru/test/api');
  const util       = require('koru/util');
  const dbBroker   = require('./db-broker');
  const TH         = require('./test-helper');

  const Model    = require('./main');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module({subjectName: 'Model'});
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      dbBroker.clearDbId();
      delete Model._databases.foo1;
      v = null;
    },

    "test createStopGap"() {
      /**
       * Create a stopGap version of a model record. StopGap records
       * are not persisted. See {#/koru/model/query-idb#queueChange}.
       * stopGap records are created even if the have validation
       * errors.
       **/
      this.stub(session, 'rpc');
      const TestModel = Model.define('TestModel').defineFields({
        name: 'text'});

      TestModel.prototype.validate = function() {
        Val.addError(this, 'dob', "is_invalid");
      };

      v.foo = TestModel.createStopGap({_id: 'foo123', name: 'testing'});
      refute.called(session.rpc);
      assert.same(v.foo[stopGap$], true);
      assert.same(TestModel.findById('foo123'), v.foo);
      assert.same(v.foo.name, 'testing');
      refute(v.foo.$isValid());
    },

    "test $remove"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});

      TestModel.onChange(v.afterRemove = test.stub());

      const doc = TestModel.create({name: 'foo'});
      const spy = test.spy(session, "rpc");

      doc.$remove();

      assert.calledWith(spy, 'remove', 'TestModel', doc._id);

      refute(TestModel.findById(doc._id));

      assert.called(v.afterRemove);
    },

    "test create returns same as findById"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});

      const doc = TestModel.create({name: 'foo'});
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
      const TestModel = Model.define('TestModel');
      const stub = test.stub().returns('result');
      assert.same(TestModel.transaction(stub), 'result');

      assert.called(stub);
    },

    "test setting docs"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      v.idx = TestModel.addUniqueIndex('name');

      const foo1 = new TestModel({_id: 'foo1', name: 'Foo'});

      TestModel.docs = {foo1: foo1};

      const res = TestModel.query.withIndex(v.idx, 'Foo').fetch();

      assert.equals(res, [foo1]);
    },
  });
});
