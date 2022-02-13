define((require, exports, module) => {
  'use strict';
  const DocChange       = require('koru/model/doc-change');
  const dbBroker        = require('./db-broker');
  const TH              = require('./test-helper');

  const {stub, spy, intercept, match: m} = TH;

  const Model = require('./main');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    let obs, TestModel, doc;
    beforeEach(async () => {
      obs = [];
      TestModel = Model.define('TestModel').defineFields({
        name: 'string', age: 'number', toys: 'object'});
      doc = await TestModel.create({name: 'Fred', age: 5, toys: ['robot']});
    });

    afterEach(async () => {
      obs.forEach((row) => row.stop());
      await Model._destroyModel('TestModel', 'drop');
      dbBroker.clearDbId();
    });

    test('observeIds', async () => {
      const doc2 = await TestModel.create({name: 'Bob', age: 35});
      const ob = stub();
      const ids = TestModel.observeIds([doc._id, doc2._id], ob);
      obs.push(ids);

      const doc3 = await TestModel.create({name: 'Helen', age: 25});
      ids.replaceIds([doc._id, doc3._id]);

      doc3.age = 10;
      await doc3.$$save();

      assert.calledWith(ob, DocChange.change(doc3.$reload(), {age: 25}));

      doc2.age = 10;
      await doc2.$$save();

      refute.calledWith(ob, m.any, TH.matchModel(doc2.$reload()));
    });

    test('multi dbs', () => {
      const origId = dbBroker.dbId;
      let dbId = origId;
      intercept(dbBroker, 'dbId');
      Object.defineProperty(dbBroker, 'dbId', {configurable: true, get() {return dbId}});
      const oc = spy(TestModel, 'onChange');

      const origOb = stub();
      obs.push(TestModel.observeIds([doc._id], origOb));
      dbId = 'alt';
      assert.same(dbBroker.dbId, 'alt');

      let oFunc;
      assert.calledWith(oc, TH.match((func) => oFunc = func));
      oc.reset();
      const altOb = stub();
      const altHandle = TestModel.observeIds([doc._id], altOb);
      obs.push(altHandle);
      let altFunc;
      assert.calledWith(oc, TH.match((func) => altFunc = func));
      oFunc(DocChange.change(doc, {name: 'old'}));
      assert.calledWith(origOb, DocChange.change(doc, {name: 'old'}));
      refute.called(altOb);

      origOb.reset();
      altFunc(DocChange.change(doc, {name: 'old'}));
      assert.calledWith(altOb, DocChange.change(doc, {name: 'old'}));
      refute.called(origOb);

      dbId = origId;
      altHandle.stop();
      dbId = 'alt';

      altOb.reset();
      altFunc(DocChange.change(doc, {name: 'old'}));
      refute.called(altOb);

      oc.reset();
      obs.push(TestModel.observeIds([doc._id], stub()));
      obs.push(TestModel.observeIds([doc._id], stub()));
      assert.calledOnce(oc);
    });

    isServer && test('async observeId', async () => {
      const ob1 = stub();
      const ob2 = stub();
      const ob3 = stub();
      obs.push(
        TestModel.observeId(doc._id, async (v) => {await 1; ob1(v)}),
        TestModel.observeId(doc._id, ob2),
        TestModel.onChange(ob3));

      doc.age = 17;
      await doc.$$save();

      assert.calledWith(ob1, DocChange.change(doc.$reload(), {age: 5}));
      assert.calledWith(ob2, DocChange.change(doc.$reload(), {age: 5}));
      assert(ob1.calledBefore(ob2));
      assert(ob2.calledBefore(ob3));
    });

    test('observeId changed', async () => {
      const ob1 = stub();
      const ob2 = stub();
      obs.push(TestModel.observeId(doc._id, ob1));
      obs.push(TestModel.observeId(doc._id, ob2));

      doc.age = 17;
      await doc.$$save();

      assert.calledWith(ob1, DocChange.change(doc.$reload(), {age: 5}));
      assert.calledWith(ob2, DocChange.change(doc.$reload(), {age: 5}));
    });

    test('observeId removed', async () => {
      const ob = stub();
      obs.push(TestModel.observeId(doc._id, ob));

      await doc.$remove();

      assert.calledWith(ob, DocChange.delete(doc));
    });
  });
});
