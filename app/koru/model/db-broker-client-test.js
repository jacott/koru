define((require, exports, module)=>{
  'use strict';
  /**
   * dbBroker allows for multiple databases and server connections within one browser instance.
   **/
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const Model           = require('./main');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const dbBroker = require('./db-broker');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      api.module({subjectName: 'dbBroker'});
    });

    afterEach(()=>{
      Model._destroyModel('TestModel', 'drop');
      dbBroker.clearDbId();
      delete Model._databases.foo1;
      delete Model._databases.foo2;
    });

    test("changing defaultDbId, mainDbId", ()=>{
      onEnd(() => dbBroker.setDefaultDbId('default'));
      assert.same(dbBroker.dbId, 'default');
      dbBroker.setMainDbId('bar');
      assert.same(dbBroker.dbId, 'bar');
      dbBroker.setDefaultDbId('foo');
      dbBroker.dbId = null;
      assert.same(dbBroker.dbId, 'foo');
      dbBroker.setMainDbId('bar');
      dbBroker.clearDbId();
      assert.same(dbBroker.dbId, 'foo');
    });

    test("changing dbId", ()=>{
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      const docGlobal = TestModel.create({_id: 'glo1', name: 'global'});

      dbBroker.dbId = 'foo1';

      const anyChanged = stub(), foo1Changed = stub();

      const obAny = TestModel.onAnyChange(anyChanged);
      const obFoo1 = TestModel.onChange(foo1Changed);

      const doc = TestModel.create({_id: 'tmf1', name: 'foo1'});

      dbBroker.dbId = 'foo2';

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
      dbBroker.withDB('foo2', () => {dbBroker.setMainDbId('foo1')});

      assert.same(TestModel.findById('tmf1'), doc);

      assert.same(Model._getProp('foo1', 'TestModel', 'docs'), TestModel.docs);
      assert.same(Model._getProp('foo2', 'TestModel', 'docs').tmf1, doc2);

      dbBroker.dbId = 'foo2';


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

    test("makeFactory", ()=>{
      /**
       * Make a factory that will create runners as needed for the current thread DB. Runners are
       * useful to keep state information on a per DB basis

       * @param {[any-type]} args arbitrary arguments to pass to the constructor
       **/
      api.method();
      //[
      const defId = dbBroker.dbId;
      const altId = "alt";

      class DBRunner extends dbBroker.DBRunner {
        constructor(a, b) {
          super();
          this.a = a; this.b = b;
          this.hasStopped = false;
        }

        stopped() {this.hasStopped = true}
      }

      const DBS = dbBroker.makeFactory(DBRunner, 1, 2);

      const defRunner = DBS.current;

      assert.same(defRunner.a, 1);
      assert.same(defRunner.b, 2);


      assert.same(defRunner.constructor, DBRunner);
      assert.same(defRunner.dbId, defId);

      dbBroker.dbId = altId;

      const altRunner = DBS.current;

      assert.same(altRunner.dbId, altId);

      dbBroker.dbId = defId;

      assert.same(DBS.current, defRunner);

      assert.equals(Object.keys(DBS.list).sort(), ['alt', 'default']);

      assert.isFalse(defRunner.hasStopped);

      DBS.stop();

      assert.equals(DBS.list, {});

      assert.isTrue(defRunner.hasStopped);
      assert.isTrue(altRunner.hasStopped);
      //]
    });
  });
});
