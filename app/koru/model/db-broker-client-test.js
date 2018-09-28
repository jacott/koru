define((require, exports, module)=>{
  const util            = require('koru/util');
  const Model           = require('./main');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const sut = require('./db-broker');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      Model._destroyModel('TestModel', 'drop');
      sut.clearDbId();
      delete Model._databases.foo1;
      delete Model._databases.foo2;
    });

    test("changing defaultDbId, mainDbId", ()=>{
      onEnd(() => sut.setDefaultDbId('default'));
      assert.same(sut.dbId, 'default');
      sut.setMainDbId('bar');
      assert.same(sut.dbId, 'bar');
      sut.setDefaultDbId('foo');
      sut.dbId = null;
      assert.same(sut.dbId, 'foo');
      sut.setMainDbId('bar');
      sut.clearDbId();
      assert.same(sut.dbId, 'foo');
    });

    test("changing dbId", ()=>{
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      const docGlobal = TestModel.create({_id: 'glo1', name: 'global'});

      sut.dbId = 'foo1';

      const anyChanged = stub(), foo1Changed = stub();

      const obAny = TestModel.onAnyChange(anyChanged);
      const obFoo1 = TestModel.onChange(foo1Changed);

      const doc = TestModel.create({_id: 'tmf1', name: 'foo1'});

      sut.dbId = 'foo2';

      const foo2Changed = stub();

      const obFoo2 = TestModel.onChange(foo2Changed);
      const doc2 = TestModel.create({_id: 'tmf1', name: 'foo2'});

      assert.calledOnce(foo1Changed);
      assert.calledOnce(foo2Changed);
      assert.calledTwice(anyChanged);

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


      stub(TestModel._indexUpdate, 'reloadAll');

      TestModel.docs = {tmf1: doc};

      assert.equals(Model._databases.foo2.TestModel.docs, {tmf1: TH.matchModel(doc)});

      assert.called(TestModel._indexUpdate.reloadAll);

      /** test _destroyModel, _getProp, _getSetProp */
      Model._destroyModel('TestModel', 'drop');

      assert.same(Model._getProp('foo2', 'Foo2Model', 'docs'), undefined);


      assert.equals(Model._getSetProp('foo2', 'FooModel', 'docs', () => {return {foo: 123}}), {foo: 123});

      assert.equals(Model._databases.default, {});
      assert.equals(Model._databases.foo1, {});
      assert.equals(Model._databases.foo2, {
        FooModel: {docs: {foo: 123}}
      });
    });
  });
});
