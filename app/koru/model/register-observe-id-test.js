define((require, exports, module)=>{
  const DocChange       = require('koru/model/doc-change');
  const dbBroker        = require('./db-broker');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, intercept, match: m} = TH;

  const Model = require('./main');
  let v= {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.obs = [];
      v.TestModel = Model.define('TestModel').defineFields({
        name: 'string', age: 'number', toys: 'object'});
      v.doc = v.TestModel.create({name: 'Fred', age: 5, toys: ['robot']});
    });

    afterEach(()=>{
      v.obs.forEach(row => row.stop());
      Model._destroyModel('TestModel', 'drop');
      dbBroker.clearDbId();
      v = {};
    });

    test("observeIds", ()=>{
      const doc2 =  v.TestModel.create({name: 'Bob', age: 35});
      v.obs.push(v.ids = v.TestModel.observeIds([v.doc._id, doc2._id], v.ob = stub()));

      const doc3 = v.TestModel.create({name: 'Helen', age: 25});
      v.ids.replaceIds([v.doc._id, doc3._id]);

      doc3.age = 10;
      doc3.$$save();

      assert.calledWith(v.ob, DocChange.change(doc3.$reload(), {age: 25}));

      doc2.age = 10;
      doc2.$$save();

      refute.calledWith(v.ob, m.any, TH.matchModel(doc2.$reload()));
    });

    test("multi dbs", ()=>{
      const origId = v.dbId = dbBroker.dbId;
      intercept(dbBroker, 'dbId');
      Object.defineProperty(dbBroker, 'dbId', {configurable: true, get() {return v.dbId}});
      const oc = spy(v.TestModel, 'onChange');

      v.obs.push(v.TestModel.observeIds([v.doc._id], v.origOb = stub()));
      v.dbId = 'alt';
      assert.same(dbBroker.dbId, 'alt');

      assert.calledWith(oc, TH.match(func => v.oFunc = func));
      oc.reset();
      v.obs.push(v.altHandle = v.TestModel.observeIds([v.doc._id], v.altOb = stub()));
      assert.calledWith(oc, TH.match(func => v.altFunc = func));
      v.oFunc(DocChange.change(v.doc, {name: 'old'}));
      assert.calledWith(v.origOb, DocChange.change(v.doc, {name: 'old'}));
      refute.called(v.altOb);

      v.origOb.reset();
      v.altFunc(DocChange.change(v.doc, {name: 'old'}));
      assert.calledWith(v.altOb, DocChange.change(v.doc, {name: 'old'}));
      refute.called(v.origOb);

      v.dbId = origId;
      v.altHandle.stop();
      v.dbId = 'alt';

      v.altOb.reset();
      v.altFunc(DocChange.change(v.doc, {name: 'old'}));
      refute.called(v.altOb);

      oc.reset();
      v.obs.push(v.TestModel.observeIds([v.doc._id], v.altOb = stub()));
      v.obs.push(v.TestModel.observeIds([v.doc._id], v.altOb = stub()));
      assert.calledOnce(oc);
    });

    test("observeId changed", ()=>{
      v.obs.push(v.TestModel.observeId(v.doc._id, v.ob1 = stub()));
      v.obs.push(v.TestModel.observeId(v.doc._id, v.ob2 = stub()));

      v.doc.age = 17;
      v.doc.$$save();

      assert.calledWith(v.ob1, DocChange.change(v.doc.$reload(), {age: 5}));
      assert.calledWith(v.ob2, DocChange.change(v.doc.$reload(), {age: 5}));
    });

    test("observeId removed", ()=>{
      v.obs.push(v.TestModel.observeId(v.doc._id, v.ob = stub()));

      v.doc.$remove();

      assert.calledWith(v.ob, DocChange.delete(v.doc));
    });
  });
});
