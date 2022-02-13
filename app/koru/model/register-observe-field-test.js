define((require, exports, module) => {
  'use strict';
  const DocChange       = require('koru/model/doc-change');
  const dbBroker        = require('./db-broker');
  const Model           = require('./main');
  const TH              = require('./test-helper');

  const {stub, spy, intercept, matchModel: mm, match: m} = TH;

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    let TestModel, doc, obs;
    beforeEach(async () => {
      TestModel = Model.define('TestModel').defineFields({name: 'string', age: 'number', toys: 'object'});
      doc = await TestModel.create({name: 'Fred', age: 5, toys: ['robot']});
      obs = [];
      TestModel.registerObserveField('age');
    });

    afterEach(async () => {
      await Model._destroyModel('TestModel', 'drop');
      for (let i = 0; i < obs.length; ++i) obs[i].stop();
    });

    isServer && group('async callbacks', () => {
      const assertCallbacks = (callback) => {
        assert.called(callback.at(-1));
        for (let i = 0; i + 1 < callback.length; ++i) {
          assert(callback[i].calledBefore(callback[i + 1]), `callback ${i} not called before ${i + 1}`);
        }
      };

      test('single value change', async () => {
        const callback = [0, 1, 2, 3].map(() => stub());
        obs.push(
          TestModel.observeAge([5], async (dc) => {await 1; callback[0]()}),
          TestModel.observeAge([5], callback[1]),
          TestModel.observeAge([6], async (dc) => {await 1; callback[2]()}),
          TestModel.onChange(callback[3]),
        );

        doc.age = 6;
        await doc.$$save();
        assertCallbacks(callback);
      });

      test('multi old change', async () => {
        doc.toys = ['robot', 'bear'];
        await doc.$$save();
        const callback = [0, 1, 2, 3].map(() => stub());
        TestModel.registerObserveField('toys');
        obs.push(
          TestModel.observeToys(['robot'], async (dc) => {await 1; callback[0]()}),
          TestModel.observeToys(['bear'], callback[1]),
          TestModel.observeToys(['car'], async (dc) => {await 1; callback[2]()}),
          TestModel.onChange(callback[3]),
        );

        doc.toys = ['robot', 'car', 'bear'];
        await doc.$$save();
        assertCallbacks(callback);
      });

      test('multi new value only', async () => {
        const callback = [0, 1, 2, 3].map((n) => stub());
        TestModel.registerObserveField('toys');
        obs.push(
          TestModel.observeToys(['bear'], async (dc) => {await 1; callback[1]()}),
          TestModel.observeToys(['bear'], callback[2]),
          TestModel.observeToys(['car'], async (dc) => {await 1; callback[0]()}),
          TestModel.onChange(callback[3]),
        );

        doc.toys = ['robot', 'car', 'bear'];
        await doc.$$save();
        assertCallbacks(callback);
      });

      test('single new value only', async () => {
        const callback = [0, 1, 2, 3].map(() => stub());
        obs.push(
          TestModel.observeAge([6], async (dc) => {await 1; callback[0]()}),
          TestModel.observeAge([6], callback[1]),
          TestModel.observeAge([6], async (dc) => {await 1; callback[2]()}),
          TestModel.onChange(callback[3]),
        );

        doc.age = 6;
        await doc.$$save();
        assertCallbacks(callback);
      });
    });

    test('values must be an array', () => {
      TestModel.registerObserveField('toys');
      assert.exception(() => {
        TestModel.observeToys('robot', stub());
      }, {message: 'values must be an array'});
    });

    test('multi dbs', () => {
      TestModel.registerObserveField('toys');
      const origId = dbBroker.dbId;
      let dbId = origId;
      intercept(dbBroker, 'dbId');
      Object.defineProperty(dbBroker, 'dbId', {configurable: true, get() {return dbId}});
      const oc = spy(TestModel, 'onChange');

      const origOb = stub();
      obs.push(TestModel.observeToys(['robot'], origOb));
      dbId = 'alt';
      assert.same(dbBroker.dbId, 'alt');

      let oFunc;
      assert.calledWith(oc, m((func) => oFunc = func));
      oc.reset();
      const altOb = stub();
      const altHandle = TestModel.observeToys(['robot'], altOb);
      obs.push(altHandle);
      let altFunc;
      assert.calledWith(oc, m((func) => altFunc = func));
      oFunc(DocChange.change(doc, {name: 'old'}));
      assert.calledWith(origOb, DocChange.change(doc, {name: 'old'}));
      refute.called(altOb);

      origOb.reset();
      altFunc(DocChange.change(doc, {name: 'old'}));
      assert.calledWith(altOb, DocChange.change(doc, {name: 'old'}));
      refute.called(origOb);

      altHandle.stop();

      altOb.reset();
      altFunc(DocChange.change(doc, {name: 'old'}));
      refute.called(altOb);

      oc.reset();
      obs.push(TestModel.observeToys(['robot'], stub()));
      obs.push(TestModel.observeToys(['buzz'], stub()));
      assert.calledOnce(oc);
    });

    group('observe array field', () => {
      let callback;
      beforeEach(() => {
        TestModel.registerObserveField('toys');

        obs.push(TestModel.observeToys(['buzz', 'woody'], callback = stub()));
      });

      test('adding observed field', async () => {
        const doc = await TestModel.create({name: 'Andy', age: 7, toys: ['woody', 'slinky']});

        assert.calledOnceWith(callback, DocChange.add(doc));
      });

      test('adding two observed fields', async () => {
        const doc = await TestModel.create({name: 'Andy', age: 7, toys: ['woody', 'buzz']});

        assert.calledOnceWith(callback, DocChange.add(doc));
      });

      test('updating observered field', async () => {
        doc.toys = ['woody', 'slinky'];
        await doc.$$save();

        assert.calledWith(callback, DocChange.change(doc.$reload(), {
          $partial: {toys: ['$patch', [0, 2, ['robot']]]}}));
      });

      test('add/remove to observered field', async () => {
        await doc.$onThis.addItems('toys', ['woody']);

        assert.calledWith(callback, DocChange.change(doc.$reload(), {$partial: {
          toys: ['$remove', ['woody']]}}));

        callback.reset();
        await doc.$onThis.removeItems('toys', ['woody']);

        assert.calledWith(callback, DocChange.change(doc.$reload(), {$partial: {
          toys: ['$add', ['woody']]}}));
      });

      test('updating other field', async () => {
        doc.toys = ['woody', 'buzz'];
        await doc.$$save();
        callback.reset();

        doc.$reload().age = 8;
        await doc.$$save();

        assert.calledWith(callback, DocChange.change(doc.$reload(), {age: 5}));
      });
    });

    group('manipulation', () => {
      let ids, doc2, doc3, callback;
      beforeEach(async () => {
        doc2 = await TestModel.create({name: 'Bob', age: 35});
        doc3 = await TestModel.create({name: 'Helen', age: 25});

        obs.push(ids = TestModel.observeAge([5, 35], callback = stub()));
      });

      test('replaceValues', async () => {
        ids.replaceValues([5, 25]);

        await TestModel.create({name: 'Henry', age: 35});
        refute.called(callback);

        doc3.name = 'changed';
        await doc3.$$save();
        assert.calledWith(callback, DocChange.change(doc3.$reload(), {name: 'Helen'}));
        callback.reset();

        ids.stop();

        doc3.name = 'Helen';
        await doc3.$$save();
        refute.called(callback);
      });

      test('addValue', async () => {
        ids.addValue(25);

        const doc = await TestModel.create({_id: '123', name: 'Mamma', age: 25});

        assert.calledWith(callback, DocChange.add(doc));
      });

      test('removeValue', async () => {
        ids.removeValue(5);

        doc2.age = 5;
        await doc2.$$save();

        assert.calledWith(callback, DocChange.change(doc2.$reload(), {age: 35}));

        callback.reset();

        doc2.name = 'new name';
        await doc2.$$save();

        refute.called(callback);
      });
    });
  });
});
