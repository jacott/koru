define(function (require, _, module) {
  var test, v;
  var TH = require('./test-helper');
  const util = require('koru/util');
  const sut  = require('./db-broker');
  const Model = require('./main');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      sut.clearDbId();
      delete Model._databases.foo1;
      delete Model._databases.foo2;
      v = null;
    },

    "test changing defaultDbId, mainDbId"() {
      test.onEnd(() => sut.setDefaultDbId('default'));
      assert.same(sut.dbId, 'default');
      sut.setMainDbId('bar');
      assert.same(sut.dbId, 'bar');
      sut.setDefaultDbId('foo');
      sut.dbId = null;
      assert.same(sut.dbId, 'foo');
      sut.pushDbId('fuzz');
      sut.popDbId();
      assert.same(sut.dbId, 'foo');
      sut.setMainDbId('bar');
      sut.pushDbId('fuzz');
      assert.same(sut.dbId, 'fuzz');
      sut.popDbId();
      assert.same(sut.dbId, 'bar');
      sut.clearDbId();
      assert.same(sut.dbId, 'foo');
    },

    "test changing dbId"() {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});
      var docGlobal = TestModel.create({_id: 'glo1', name: 'global'});

      sut.dbId = 'foo1';

      var obAny = TestModel.onAnyChange(v.anyChanged = test.stub());
      var obFoo1 = TestModel.onChange(v.foo1Changed = test.stub());

      var doc = TestModel.create({_id: 'tmf1', name: 'foo1'});

      sut.dbId = 'foo2';

      var obFoo2 = TestModel.onChange(v.foo2Changed = test.stub());
      var doc2 = TestModel.create({_id: 'tmf1', name: 'foo2'});

      assert.calledOnce(v.foo1Changed);
      assert.calledOnce(v.foo2Changed);
      assert.calledTwice(v.anyChanged);

      assert.equals(Model._databases.default, {
        TestModel: {
          docs: {glo1: TH.matchModel(docGlobal)},
        }
      });
      assert.equals(Model._databases.foo1,  {
        TestModel: {
          docs: {tmf1: TH.matchModel(doc)},
          notify: TH.match.object,
        }
      });
      assert.equals(Model._databases.foo2,  {
        TestModel: {
        docs: {tmf1: TH.matchModel(doc2)},
        notify: TH.match.object,
        }
      });

      assert.same(TestModel.findById('tmf1'), doc2);

      /** Test can change the main db id from within a temp change */
      sut.withDB('foo2', () => {sut.setMainDbId('foo1')});

      assert.same(TestModel.findById('tmf1'), doc);

      assert.same(Model._getProp('foo1', 'TestModel', 'docs'), TestModel.docs);
      assert.same(Model._getProp('foo2', 'TestModel', 'docs').tmf1, doc2);

      sut.dbId = 'foo2';


      test.stub(TestModel._indexUpdate, 'reloadAll');

      TestModel.docs = {tmf1: doc};

      assert.equals(Model._databases.foo2.TestModel.docs, {tmf1: TH.matchModel(doc)});

      assert.called(TestModel._indexUpdate.reloadAll);

      /** test _destroyModel, _getProp, _getSetProp */
      Model._destroyModel('TestModel', 'drop');

      assert.isFalse(Model._getProp('foo2', 'Foo2Model', 'docs'));


      assert.equals(Model._getSetProp('foo2', 'FooModel', 'docs', () => {return {foo: 123}}), {foo: 123});

      assert.equals(Model._databases.default, {});
      assert.equals(Model._databases.foo1, {});
      assert.equals(Model._databases.foo2, {
        FooModel: {docs: {foo: 123}}
      });
    },
  });
});