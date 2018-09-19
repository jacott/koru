define((require, exports, module)=>{
  const util     = require('koru/util');
  const dbBroker = require('./db-broker');
  const Model    = require('./main');
  const TH       = require('./test-helper');

  const {stub, spy, onEnd, intercept, matchModel: mm, match: m} = TH;

  let v = {};
  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.TestModel = Model.define('TestModel').defineFields({name: 'string', age: 'number', toys: 'object'});
      v.doc = v.TestModel.create({name: 'Fred', age: 5, toys: ['robot']});
      v.obs = [];
      v.TestModel.registerObserveField('age');
    });

    afterEach(()=>{
      Model._destroyModel('TestModel', 'drop');
      for(let i = 0; i < v.obs.length; ++i) v.obs[i].stop();
      v = {};
    });

    test("values must be an array", ()=>{
      v.TestModel.registerObserveField('toys');
      assert.exception(()=>{
        v.TestModel.observeToys('robot', stub());
      }, {message: 'values must be an array'});
    });

    test("multi dbs", ()=>{
      v.TestModel.registerObserveField('toys');
      const origId = v.dbId = dbBroker.dbId;
      intercept(dbBroker, 'dbId');
      Object.defineProperty(dbBroker, 'dbId', {configurable: true, get() {return v.dbId}});
      const oc = spy(v.TestModel, 'onChange');

      v.obs.push(v.TestModel.observeToys(['robot'], v.origOb = stub()));
      v.dbId = 'alt';
      assert.same(dbBroker.dbId, 'alt');

      assert.calledWith(oc, m(func => v.oFunc = func));
      oc.reset();
      v.obs.push(v.altHandle = v.TestModel.observeToys(['robot'], v.altOb = stub()));
      assert.calledWith(oc, m(func => v.altFunc = func));
      v.oFunc(v.doc, {name: 'old'});
      assert.calledWith(v.origOb, v.doc);
      refute.called(v.altOb);

      v.origOb.reset();
      v.altFunc(v.doc, {name: 'old'});
      assert.calledWith(v.altOb, v.doc);
      refute.called(v.origOb);

      v.altHandle.stop();

      v.altOb.reset();
      v.altFunc(v.doc, {name: 'old'});
      refute.called(v.altOb);


      oc.reset();
      v.obs.push(v.TestModel.observeToys(['robot'], stub()));
      v.obs.push(v.TestModel.observeToys(['buzz'], stub()));
      assert.calledOnce(oc);
    });

    group("observe array field", ()=>{
      beforeEach(()=>{
        v.TestModel.registerObserveField('toys');

        v.obs.push(v.toys = v.TestModel.observeToys(['buzz', 'woody'], v.callback = stub()));
      });

      test("adding observed field", ()=>{
        const doc = v.TestModel.create({name: 'Andy', age: 7, toys: ['woody', 'slinky']});

        assert.calledOnceWith(v.callback, mm(doc), null);
      });

      test("adding two observed fields", ()=>{
        const doc = v.TestModel.create({name: 'Andy', age: 7, toys: ['woody', 'buzz']});

        assert.calledOnceWith(v.callback, mm(doc), null);
      });

      test("updating observered field", ()=>{
        v.doc.toys = v.attrs = ['woody', 'slinky'];
        v.doc.$$save();

        assert.calledWith(v.callback, mm(v.doc.$reload()), {
          $partial: {toys: ['$patch', [0, 2, ['robot']]]}});
      });

      test("add/remove to observered field", ()=>{
        v.doc.$onThis.addItems('toys', ['woody']);

        assert.calledWith(v.callback, mm(v.doc.$reload()), {$partial: {
          toys: ['$remove', ['woody']]}});

        v.callback.reset();
        v.doc.$onThis.removeItems('toys', ['woody']);

        assert.calledWith(v.callback, mm(v.doc.$reload()), {$partial: {
          toys: ['$add', ['woody']]}});
      });

      test("updating other field", ()=>{
        v.doc.toys = v.attrs = ['woody', 'buzz'];
        v.doc.$$save();
        v.callback.reset();

        v.doc.$reload().age = 8;
        v.doc.$$save();

        assert.calledWith(v.callback, mm(v.doc.$reload()), {age: 5});
      });
    });

    group("manipulation", ()=>{
      beforeEach(()=>{
        v.doc2 =  v.TestModel.create({name: 'Bob', age: 35});
        v.doc3 = v.TestModel.create({name: 'Helen', age: 25});

        v.obs.push(v.ids = v.TestModel.observeAge([5, 35], v.callback = stub()));
      });

      test("replaceValues", ()=>{
        v.ids.replaceValues([5, 25]);

        v.TestModel.create({name: 'Henry', age: 35});
        refute.called(v.callback);

        v.doc3.name = "changed";
        v.doc3.$$save();
        assert.calledWith(v.callback, mm(v.doc3.$reload()), {name: 'Helen'});
        v.callback.reset();

        v.ids.stop();

        v.doc3.name = "Helen";
        v.doc3.$$save();
        refute.called(v.callback);
      });

      test("addValue", ()=>{
        v.ids.addValue(25);

        const doc = v.TestModel.create({_id: '123', name: 'Mamma', age: 25});

        assert.calledWith(v.callback, mm(doc));
      });

      test("removeValue", ()=>{
        v.ids.removeValue(5);

        v.doc2.age = 5;
        v.doc2.$$save();

        assert.calledWith(v.callback, mm(v.doc2.$reload()));

        v.callback.reset();

        v.doc2.name = 'new name';
        v.doc2.$$save();

        refute.called(v.callback);
      });
    });
  });
});
