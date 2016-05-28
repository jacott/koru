define(function (require, exports, module) {
  'use strict';
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');
  var session = require('../session/base');
  var util = require('koru/util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      util.clearDbId();
      delete Model._databases.foo1;
      delete Model._databases.foo2;
      v = null;
    },

    "test changing defaultDbId, mainDbId": function () {
      test.onEnd(() => util.setDefaultDbId('default'));
      assert.same(util.dbId, 'default');
      util.setMainDbId('bar');
      assert.same(util.dbId, 'bar');
      util.setDefaultDbId('foo');
      util.dbId = null;
      assert.same(util.dbId, 'foo');
      util.pushDbId('fuzz');
      util.popDbId();
      assert.same(util.dbId, 'foo');
      util.setMainDbId('bar');
      util.pushDbId('fuzz');
      assert.same(util.dbId, 'fuzz');
      util.popDbId();
      assert.same(util.dbId, 'bar');
      util.clearDbId();
      assert.same(util.dbId, 'foo');
    },

    "test changing dbId": function () {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});
       var docGlobal = TestModel.create({_id: 'glo1', name: 'global'});

      util.dbId = 'foo1';

      var obAny = TestModel.onAnyChange(v.anyChanged = test.stub());
      var obFoo1 = TestModel.onChange(v.foo1Changed = test.stub());

      var doc = TestModel.create({_id: 'tmf1', name: 'foo1'});

      util.dbId = 'foo2';

      var obFoo2 = TestModel.onChange(v.foo2Changed = test.stub());
      var doc2 = TestModel.create({_id: 'tmf1', name: 'foo2'});

      assert.calledOnce(v.foo1Changed);
      assert.calledOnce(v.foo2Changed);
      assert.calledTwice(v.anyChanged);

      assert.equals(Model._databases, {
        default: {TestModel: {
          docs: {glo1: TH.matchModel(docGlobal)},
        }},
        foo1: {TestModel: {
          docs: {tmf1: TH.matchModel(doc)},
          notify: TH.match.object,
        }},
        foo2: {TestModel: {
          docs: {tmf1: TH.matchModel(doc2)},
          notify: TH.match.object,
        }},
      });

      assert.same(TestModel.findById('tmf1'), doc2);

      /** Test can change the main db id from within a temp change */
      util.withDB('foo2', () => {util.setMainDbId('foo1')});

      assert.same(TestModel.findById('tmf1'), doc);

      assert.same(Model._getProp('foo1', 'TestModel', 'docs'), TestModel.docs);
      assert.same(Model._getProp('foo2', 'TestModel', 'docs').tmf1, doc2);

      util.dbId = 'foo2';


      test.stub(TestModel._indexUpdate, 'reloadAll');

      TestModel.docs = {tmf1: doc};

      assert.equals(Model._databases.foo2.TestModel.docs, {tmf1: TH.matchModel(doc)});

      assert.called(TestModel._indexUpdate.reloadAll);

      /** test _destroyModel, _getProp, _getSetProp */
      Model._destroyModel('TestModel', 'drop');

      assert.isFalse(Model._getProp('foo2', 'Foo2Model', 'docs'));


      assert.equals(Model._getSetProp('foo2', 'FooModel', 'docs', () => {return {foo: 123}}), {foo: 123});

      assert.equals(Model._databases, {default: {}, foo1: {}, foo2: {
        FooModel: {docs: {foo: 123}}
      }});

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

      assert.equals(Object.keys(Model._databases), ['default']);
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

    "test setting docs": function () {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});
      v.idx = TestModel.addUniqueIndex('name');

      var foo1 = new TestModel({_id: 'foo1', name: 'Foo'});

      TestModel.docs = {foo1: foo1};

      var res = TestModel.query.withIndex(v.idx, 'Foo').fetch();

      assert.equals(res, [foo1]);
    },

  });
});
