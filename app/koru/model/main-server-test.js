define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const koru            = require('koru/main');
  const dbBroker        = require('koru/model/db-broker');
  const DocChange       = require('koru/model/doc-change');
  const Query           = require('koru/model/query');
  const Driver          = require('koru/pg/driver');
  const session         = require('koru/session');
  const util            = require('koru/util');
  const TH              = require('./test-helper');
  const TransQueue      = require('./trans-queue');
  const Val             = require('./validation');

  const {stub, spy, match: m, matchModel: mm} = TH;

  const Model = require('./main');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    before(() => {
      TH.noInfo();
    });

    afterEach(async () => {
      await Model._destroyModel('TestModel', 'drop');
      v = {};
    });

    group('$docCache', () => {
      beforeEach(async () => {
        v.defDb = Driver.defaultDb;
        v.altDb = await Driver.connect(v.defDb._url + " options='-c search_path=alt'", 'alt');
        await v.altDb.query('CREATE SCHEMA IF NOT EXISTS alt');
      });

      afterEach(async () => {
        if (v.altDb) {
          await v.altDb.query('DROP SCHEMA IF EXISTS alt CASCADE');
          dbBroker.clearDbId();
        }
      });

      test('switching db', async () => {
        const TestModel = Model.define('TestModel').defineFields({
          name: 'text',
        });
        assert.same(TestModel._$docCacheGet('fooId'), undefined);
        await TestModel.create({_id: 'fooId', name: 'foo'});
        assert.same(TestModel._$docCacheGet('fooId').name, 'foo');
        dbBroker.db = v.altDb;
        assert.same(Model.db, v.altDb);

        assert.same(TestModel._$docCacheGet('fooId'), undefined);
        dbBroker.db = v.defDb;
        assert.same(TestModel._$docCacheGet('fooId').name, 'foo');
        const ans = await koru.fiberConnWrapper(async () => {
          v.ans = TestModel._$docCacheGet('fooId');
          return 'success';
        }, v.conn = {});
        assert.same(ans, 'success');
        assert.same(v.ans, undefined);
      });
    });

    test('auto Id', async () => {
      const TestModel = Model.define('TestModel');
      TestModel.defineFields({
        _id: {type: 'serial', auto: true},
        name: 'text',
      });

      await TestModel.create({name: 'foo'});
      const bar = await TestModel.create({name: 'bar'});
      assert.same(bar._id, 2);

      const doc = await TestModel.findBy('name', 'bar');
      assert(doc);
      assert.same(doc._id, 2);
    });

    test('invalid findById', async () => {
      const TestModel = Model.define('TestModel');

      assert.same(await TestModel.findById(null), undefined);

      try {
        await TestModel.findById({});
        assert.fail('throw exception');
      } catch (err) {
        assert.exception(err, 'Error', 'invalid id: [object Object]');
      }
    });

    test('globalDictAdders', () => {
      const adder = session._globalDictAdders[koru.absId(require, './main-server')];
      assert.isFunction(adder);

      const TestModel = Model.define('TestModel').defineFields({name: 'text', age: 'number'});

      adder(v.stub = stub());

      assert.calledWith(v.stub, '_id');
      assert.calledWith(v.stub, 'name');
      assert.calledWith(v.stub, 'age');
    });

    test('remote', async () => {
      const TestModel = Model.define('TestModel');

      TestModel.remote({foo: v.foo = stub().returns('result')});

      const transaction = spy(TestModel.db, 'transaction');

      assert.accessDenied(() => {
        session._rpcs['TestModel.foo'].call({userId: null});
      });

      refute.called(transaction);
      refute.called(v.foo);

      assert.same(await session._rpcs['TestModel.foo'].call(v.conn = {userId: 'uid'}, 1, 2),
                  'result');

      assert.calledOnce(v.foo);
      assert.calledWithExactly(v.foo, 1, 2);
      assert.same(v.foo.firstCall.thisValue, v.conn);

      assert.called(transaction);
    });

    test('when no changes in save', async () => {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = await TestModel.create({name: 'foo'});
      after(TestModel.onChange(v.onChange = stub()));
      after(TestModel.beforeSave(v.beforeSave = stub()));

      await v.doc.$save();
      await TestModel.query.onId(v.doc._id).update({});

      assert.same(v.doc.$reload().name, 'foo');
      assert.same((await v.doc.$reload(true)).name, 'foo');
      refute.called(v.onChange);
      refute.called(v.beforeSave);
    });

    test('reload and caching', async () => {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = await TestModel.create({name: 'foo'});

      v.doc.attributes.name = 'baz';
      v.doc.name = 'bar';

      let retFut = new Future();
      let waitFut = new Future();

      globalThis.__koruThreadLocal.run({}, async () => {
        try {
          while (retFut != null) {
            const what = await retFut.promise;
            waitFut.resolve(await what?.());
          }
        } catch (ex) {
          koru.unhandledException(ex);
          waitFut.reject(ex);
        }
      });

      retFut.resolve(async () => {
        retFut = new Future();
        const doc = await TestModel.findById(v.doc._id);
        doc.attributes.name = 'cache foo';
      });
      await waitFut.promise;

      await TestModel.docs.updateById(v.doc._id, {name: 'fuz'});

      assert.same(v.doc.$reload(), v.doc);
      assert.same(v.doc.name, 'baz');
      assert.same((await v.doc.$reload(true)), v.doc);
      assert.same(v.doc.name, 'fuz');

      waitFut = new Future();
      retFut.resolve(() => {
        retFut = null;
        return TestModel.findById(v.doc._id);
      });
      assert.same((await waitFut.promise).name, 'cache foo');

      await TestModel.docs.updateById(v.doc._id, {name: 'doz'});
      assert.same(v.doc.$reload().name, 'fuz');
    });

    test('overrideSave', async () => {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      TestModel.overrideSave = stub();

      const saveSpy = spy(TestModel.prototype, '$save');

      await session._rpcs.save.call({userId: 'u123'}, 'TestModel', 'fooid', {name: 'bar'});

      assert.calledWith(TestModel.overrideSave, 'fooid', {name: 'bar'}, 'u123');

      refute.called(saveSpy);
    });

    test('overrideRemove', async () => {
      const TestModel = Model.define('TestModel', {
        overrideRemove: v.overrideRemove = stub(),
      }).defineFields({name: 'text'});

      const removeSpy = spy(TestModel.prototype, '$remove');
      const doc = await TestModel.create({name: 'remove me'});

      await session._rpcs.remove.call({userId: 'u123'}, 'TestModel', doc._id);

      assert.calledWith(v.overrideRemove, 'u123');
      const model = v.overrideRemove.firstCall.thisValue;
      assert.same(model.constructor, TestModel);
      assert.same(model.name, 'remove me');

      refute.called(removeSpy);
    });

    test('$save with callback', async () => {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      const doc = TestModel.build({name: 'foo'});
      const callback2 = stub();
      const future = new Future();
      const callback = stub().invokes(() => TestModel.db.query(`SELECT 1`).then(callback2));
      const callback3 = stub();
      const p = doc.$save({callback}).then(callback3);
      refute.called(callback);
      future.resolve();
      await p;
      assert.calledWith(callback3, true);
      assert.calledWith(callback, doc);
      assert.called(callback2);
      assert(callback2.calledBefore(callback3));
    });

    test('defaults for saveRpc new', async () => {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub(),
      }).defineFields({name: 'text', language: {type: 'text', default: 'en'}});

      await session._rpcs.save.call({userId: 'u123'}, 'TestModel', null, {
        _id: 'fooid', name: 'Mel'});

      const mel = await TestModel.findById('fooid');

      assert.same(mel.language, 'en');

      await session._rpcs.save.call({userId: 'u123'}, 'TestModel', null, {
        _id: 'barid', name: 'Jen', language: 'no'});

      const jen = await TestModel.findById('barid');

      assert.same(jen.language, 'no');
    });

    test('no authorize function', async () => {
      const TestModel = Model.define('TestModel', {})
            .defineFields({name: 'text', language: {type: 'text', default: 'en'}});

      await assert.exception(
        () => session._rpcs.save.call({userId: 'u123'}, 'TestModel', null, {_id: 'fooid', name: 'Mel'}),
        {error: 403, reason: 'Access denied - Model.TestModel("fooid", "Mel")'});
    });

    test('saveRpc new', async () => {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub(async () => {await 1}),
      }).defineFields({name: 'text'});

      spy(TestModel.db, 'transaction');
      TestModel.onChange(v.onChangeSpy = stub());

      await assert.accessDenied(async () => session._rpcs.save.call(
        {userId: null}, 'TestModel', null, {_id: 'fooid', name: 'bar'}));

      refute(await TestModel.exists('fooid'));

      spy(Val, 'assertCheck');

      spy(TransQueue, 'onSuccess');
      spy(TransQueue, 'onAbort');

      await session._rpcs.save.call({userId: 'u123'}, 'TestModel', null, {_id: 'fooid', name: 'bar'});

      v.doc = await TestModel.findById('fooid');

      assert.same(v.doc.name, 'bar');

      assert.calledOnce(v.onChangeSpy);

      assert(TransQueue.onAbort.calledBefore(TransQueue.onSuccess));

      await TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, 'u123');

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);

      assert.calledWith(Val.assertCheck, null, 'string', {baseName: '_id'});

      assert.calledOnce(TestModel.db.transaction);

      stub(TestModel, '_$docCacheDelete');
      await TransQueue.onAbort.yield();
      assert.calledWith(TestModel._$docCacheDelete, m.field('_id', 'fooid'));

      v.auth.reset();
      await session._rpcs.save.call({userId: 'u123'}, 'TestModel', null, {_id: 'fooid', name: 'bar2'});

      refute.called(v.auth);
    });

    test('saveRpc existing', async () => {
      const validate = stub();
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub(),
        validate,
      }).defineFields({name: 'text'});

      v.doc = await TestModel.create({name: 'foo'});

      TestModel.onChange(v.onChangeSpy = stub());

      await assert.accessDenied(
        () => session._rpcs.save.call({userId: null}, 'TestModel', v.doc._id, {name: 'bar'}));

      await assert.exception(() =>
        session._rpcs.save.call({userId: 'u123'}, 'TestModel', 'x' + v.doc._id, {name: 'bar'}),
        {error: 404, reason: {_id: [['not_found']]}});

      assert.same(v.doc.$reload().name, 'foo');

      spy(TransQueue, 'onSuccess');

      assert.calledOnce(validate);

      await session._rpcs.save.call({userId: 'u123'}, 'TestModel', v.doc._id, {name: 'bar'});

      assert.calledTwice(validate);

      assert.same(v.doc.$reload().name, 'bar');

      assert.calledOnce(v.onChangeSpy);
      await TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, 'u123');

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);
    });

    test('saveRpc partial no modification', async () => {
      const validate = stub();
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub(),
        validate,
      }).defineFields({name: 'text', html: 'object'});

      v.doc = await TestModel.create({name: 'foo', html: {div: ['foo', 'bar']}});

      TestModel.onChange(v.onChangeSpy = stub());

      spy(TransQueue, 'onSuccess');

      assert.calledOnce(validate);
      validate.reset();

      await session._rpcs.save.call({userId: 'u123'}, 'TestModel', v.doc._id, {$partial: {
        html: [
          'div.2', 'baz',
        ],
      }});
      assert.calledOnce(validate);

      assert.equals(v.doc.$reload().html, {div: ['foo', 'bar', 'baz']});

      assert.calledOnceWith(v.onChangeSpy, DocChange.change(v.doc, {$partial: {
        html: [
          'div.2', null,
        ],
      }}));
      await TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, 'u123');

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);
    });

    test('saveRpc partial validate modifies', async () => {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub(),
      }).defineFields({name: 'text', html: 'object'});

      TestModel.prototype.validate = async function () {
        await 1;
        if (this.changes.html.div[2] === 3) {
          this.changes.html.div[2] = 'three';
        }
      }

      v.doc = await TestModel.create({name: 'foo', html: {div: ['foo', 'bar']}});

      TestModel.onChange(v.onChangeSpy = stub());

      spy(TransQueue, 'onSuccess');

      await session._rpcs.save.call({userId: 'u123'}, 'TestModel', v.doc._id, {
        name: 'fiz',
        $partial: {
          html: [
            'div.2', 3,
          ],
        }});

      assert.equals(v.doc.$reload().html, {div: ['foo', 'bar', 'three']});
      assert.equals((await v.doc.$reload(true)).html, {div: ['foo', 'bar', 'three']});

      assert.calledOnceWith(v.onChangeSpy, DocChange.change(v.doc, {
        name: 'foo', $partial: {html: ['div.$partial', ['$patch', [2, 1, null]]]}}));
      await TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, 'u123');

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);
    });

    test('removeRpc', async () => {
      const TestModel = Model.define('TestModel', {
        authorize: v.auth = stub(),
      }).defineFields({name: 'text'});

      spy(TestModel.db, 'transaction');

      v.doc = await TestModel.create({name: 'foo'});

      TestModel.onChange(v.onChangeSpy = stub());

      await assert.accessDenied(
        () => session._rpcs.remove.call({userId: null}, 'TestModel', v.doc._id));

      await assert.exception(
        () => session._rpcs.remove.call({userId: 'u123'}, 'TestModel', 'x' + v.doc._id),
        {error: 404, reason: {_id: [['not_found']]}});

      spy(TransQueue, 'onSuccess');

      await session._rpcs.remove.call({userId: 'u123'}, 'TestModel', v.doc._id);

      refute(await TestModel.findById(v.doc._id));

      assert.calledOnce(v.onChangeSpy);
      await TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWith(v.auth, 'u123', {remove: true});

      assert.calledThrice(TestModel.db.transaction);
    });

    test('addUniqueIndex', () => {
      const TestModel = Model.define('TestModel');

      const ignoreme = () => {};
      const ans = TestModel.addUniqueIndex('a', 'b', -1, 'c', 1, 'd', ignoreme);

      assert.equals(ans, {
        model: TestModel,
        sort: ['a', 'b', 'c', -1, 'd'],
        filterTest: m((q) => q instanceof Query),
        from: [-1, 'c', 1, 'd'],
        stop: util.voidFunc,
      });
    });

    test('addIndex', () => {
      const TestModel = Model.define('TestModel');

      const ensureIndex = stub(TestModel.docs, 'ensureIndex');

      const ans = TestModel.addIndex('a', 'b', -1, 'c', 1, 'd');

      assert.equals(ans, {
        model: TestModel,
        sort: ['a', 'b', 'c', -1, 'd'],
        filterTest: void 0,
        from: [-1, 'c', 1, 'd'],
        stop: util.voidFunc,
      });
    });

    test('transaction', async () => {
      const TestModel = Model.define('TestModel');
      const body = stub().returns(Promise.resolve('result'));
      const tx = spy(TestModel.db, 'transaction');
      assert.same(await TestModel.transaction(body), 'result');

      assert.called(body);
      assert.calledWith(tx, body);
    });
  });
});
