//;no-client-async
define((require, exports, module) => {
  'use strict';
  /**
   * Object persistence manager. Defines application models.
   **/
  const koru            = require('koru');
  const ModelEnv        = require('koru/env!./main');
  const BaseModel       = require('koru/model/base-model');
  const DocChange       = require('koru/model/doc-change');
  const api             = require('koru/test/api');
  const TH              = require('./test-helper');

  const {stub, spy, util, match: m, matchModel: mModel} = TH;
  const Module = module.constructor;

  const Model = require('./main');

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    before(() => {
      api.module({subjectName: 'Model'});
    });

    afterEach(async () => {
      await Model._destroyModel('Book', 'drop');
      await Model._destroyModel('TestModel', 'drop');
      v = {};
    });

    test('only models enumerable', () => {
      for (const key in Model) {
        assert.same(Object.getPrototypeOf(Model[key]), BaseModel);
      }
      assert(true);
    });

    test('auto define', async () => {
      const onUnload = stub();

      const TestModel = Model.define({
        module: v.mod = {id: 'test-model', onUnload},
        fields: {name: 'text'},
        proto: {
          foo() {return this.name},
        },
      });

      assert.calledWith(onUnload, m.func);

      assert.same(Model.TestModel, TestModel);
      assert.same(TestModel.modelName, 'TestModel');
      isServer && assert.same(TestModel.name, 'TestModel');

      let tm = await TestModel.create({name: 'my name'});

      assert.same(tm.foo(), 'my name');
      onUnload.yieldAll();
      refute(Model.TestModel);

      await ModelEnv.destroyModel(TestModel, 'drop');
    });

    test('notify onAnyChange but no async onChange', async () => {
      const Book = Model.define('Book').defineFields({name: 'text'});

      const anyChanges = [];
      after(Book.onAnyChange(async (arg) => {
        await 1;
        anyChanges.push(1, arg);
      }));
      after(Book.onAnyChange(async (arg) => {
        anyChanges.push(2, arg);
        await 1;
      }));
      const p = Book.notify('testing');
      if (isServer) {
        assert.isPromise(p);
        assert.equals(anyChanges, []);
        await p;
      } else {
        assert.same(p, undefined);
      }
      assert.equals(anyChanges, [1, 'testing', 2, 'testing']);
    });

    group('observering', () => {
      beforeEach(async () => {
        v.Book = Model.define('Book').defineFields({name: 'text'});
        v.tc = await v.Book.create({name: 'foo'});

        v.obs = {};
        const obCalled = async (doc, type, partials) => {
          const args = [util.merge({}, doc.attributes), util.merge({}, doc.changes)];
          await 1;
          if (partials !== undefined) {
            args.push(util.merge({}, partials));
          }
          (v.obs[type] = v.obs[type] || []).push(args);
        };
        after(v.Book.beforeCreate(obCalled));
        after(v.Book.beforeUpdate(obCalled));
        after(v.Book.beforeSave(obCalled));
        after(v.Book.afterLocalChange(({type, doc, undo}) => {
          (v.obs.afterLocalChange = v.obs.afterLocalChange || [])
            .push([type, Object.assign({}, doc.attributes), undo]);
        }));
        after(v.Book.whenFinally((doc, ex) => {
          (v.obs.whenFinally = v.obs.whenFinally || []).push([doc, ex]);
        }));
      });

      test('notify', async () => {
        const {Book, tc, obs} = v;
        const anyChanges = [];
        after(Book.onAnyChange(async (arg) => {
          await 1;
          anyChanges.push(1, arg);
        }));
        after(Book.onAnyChange(async (arg) => {
          anyChanges.push(2, arg);
          await 1;
        }));
        const p = Book.notify('testing');
        if (isServer) {
          assert.isPromise(p);
          assert.equals(anyChanges, []);
          await p;
        } else {
          assert.same(p, undefined);
        }
        assert.equals(anyChanges, [1, 'testing', 2, 'testing']);
      });

      test('remove calls', async () => {
        after(v.Book.onChange(v.onChange = stub()));
        after(v.Book.afterLocalChange(v.afterLocalChange = stub()));

        await v.tc.$onThis.remove();

        assert.calledOnceWith(v.afterLocalChange, DocChange.delete(v.tc));
        assert.calledOnceWith(v.onChange, DocChange.delete(v.tc));
        assert(v.afterLocalChange.calledBefore(v.onChange));

        assert.equals(v.obs.afterLocalChange, [['del', {name: 'foo', _id: v.tc._id}, 'add']]);
      });

      test('update calls', async () => {
        after(v.Book.onChange(({type, doc, undo}) => {
          refute(v.docAttrs);
          v.docAttrs = Object.assign({}, doc.attributes);
          v.docChanges = Object.assign({}, undo);
        }).stop);

        v.tc.name = 'bar';
        await v.tc.$save();

        assert.equals(v.docAttrs, {name: 'bar', _id: v.tc._id});
        assert.equals(v.docChanges, {name: 'foo'});

        assert.equals(v.obs.beforeUpdate, [[{name: 'foo', _id: v.tc._id}, {name: 'bar'}]]);
        assert.equals(v.obs.beforeSave, [[{name: 'foo', _id: v.tc._id}, {name: 'bar'}]]);
        assert.equals(v.obs.afterLocalChange, [['chg', {name: 'bar', _id: v.tc._id}, {name: 'foo'}]]);
        assert.equals(v.obs.whenFinally, [[mModel(v.tc), undefined]]);

        refute(v.obs.beforeCreate);
      });

      test('create calls', async () => {
        after(v.Book.onChange(v.onChange = stub()).stop);
        v.tc = await v.Book.create({name: 'foo'});
        assert.calledOnceWith(v.onChange, DocChange.add(m((doc) => doc.attributes === v.tc.attributes)));

        assert.equals(v.obs.beforeCreate, [[{}, {name: 'foo', _id: v.tc._id}]]);
        assert.equals(v.obs.beforeSave, [[{}, {name: 'foo', _id: v.tc._id}]]);
        assert.equals(v.obs.afterLocalChange, [['add', {name: 'foo', _id: v.tc._id}, 'del']]);
        assert.equals(v.obs.whenFinally, [[mModel(v.tc), undefined]]);

        refute(v.obs.beforeUpdate);
      });

      test('create exception', async () => {
        after(v.Book.beforeCreate(() => {throw v.ex = new Error('tex')}));

        await assert.exception(() => v.Book.create({name: 'foo'}), 'Error', 'tex');

        assert.equals(v.obs.whenFinally, [[m((x) => x.name === 'foo'), v.ex]]);
      });

      test('update exception', async () => {
        after(v.Book.beforeUpdate(() => {throw v.ex = new Error('tex')}));

        await assert.exception(async () => {
          v.tc.name = 'bar';
          await v.tc.$save();
        }, 'Error', 'tex');

        assert.equals(v.obs.whenFinally, [[mModel(v.tc), v.ex]]);
      });
    });

    group('versioning', () => {
      before(() => {
        v.Book = Model.define('Book').defineFields({name: 'text'});
      });

      test('no _version', async () => {
        const tc = await v.Book.create({name: 'foo'});

        assert.same(tc._version, undefined);
      });

      test('updating', async () => {
        v.Book.addVersioning();

        const tc = await v.Book.create({name: 'foo'});

        assert.same(tc._version, 1);

        tc.name = 'bar';
        await tc.$save();

        assert.same(tc.$reload()._version, 2);
      });

      test('bumping', async () => {
        v.Book.addVersioning();

        const tc = await v.Book.create({name: 'foo'});

        await tc.$bumpVersion();

        assert.same(tc.$reload()._version, 2);

        await tc.$bumpVersion();
        assert.same(tc.$reload()._version, 3);
      });
    });

    test('ref cache', async () => {
      const Book = Model.define('Book').defineFields({name: 'text'});
      const foo = await Book.create();

      foo.$cacheRef('bin')['123'] = 5;

      assert.same(foo.$cacheRef('bin')['123'], 5);

      assert.same(foo.$reload().$cacheRef('bin')['123'], undefined);

      foo.$cacheRef('bin')['123'] = 7;
      assert.same(foo.$cacheRef('bin')['123'], 7);

      foo.$clearCache();

      assert.same(foo.$reload().$cacheRef('bin')['123'], undefined);
    });

    test('cache', async () => {
      const Book = Model.define('Book').defineFields({name: 'text'});
      const foo = await Book.create();

      assert.same(foo, Book.findById(foo._id));

      foo.$cache.boo = 5;

      assert.same(foo.$cache.boo, 5);

      assert.same(foo.$reload().$cache.boo, undefined);
    });

    test('change recording', () => {
      const Book = Model.define('Book').
            defineFields({
              name: 'text',
              other: 'number',
            });

      const testAttrs = {_id: 123, name: 'orig name'};
      const tsc = new Book(testAttrs);

      tsc.name = 'orig name';
      assert.equals(tsc.changes, {});

      tsc.name = 'new name';
      assert.equals(tsc.changes, {name: 'new name'});

      tsc.name = 'another';
      assert.equals(tsc.changes, {name: 'another'});

      tsc.other = 'new other';
      assert.equals(tsc.changes, {name: 'another', other: 'new other'});

      tsc.name = 'orig name';
      assert.equals(tsc.changes, {other: 'new other'});

      assert.same(tsc.attributes, testAttrs);

      tsc.name = undefined;

      assert.same(tsc.name, undefined);
    });

    test('remove', async () => {
      const Book = Model.define('Book');
      Book.defineFields({name: 'text'});
      const doc = await Book.build({name: 'foo'}).$$save();

      assert.isTrue(await Book.exists({_id: doc._id}));

      await doc.$remove();

      assert.same(await Book.findById(doc._id), undefined);
    });

    test('define via module', () => {
      /**
       * Define a new model.
       * define(options) or
       * define(module, [name, [proto]])
       * @see BaseModel.define
       */
      const onUnload = stub();
      const module = new Module(undefined, '/foo/test-model');
      module.onUnload = onUnload;
      const TestModel = Model.define(module, {t1: 123});
      assert.same(Model.TestModel, TestModel);
      assert.same(Model.TestModel._module, module);

      assert.calledWith(onUnload, m.func);

      onUnload.yield();

      refute(Model.Book);
    });

    test('define with name', () => {
      const Book = Model.define('Book', {t1: 123});

      const testAttrs = {_id: 123, name: 'orig name'};
      let tsc = new Book(testAttrs);

      assert.same(tsc.constructor, Book);
      assert.same(tsc.attributes, testAttrs);
      assert.same(tsc.t1, 123);

      assert.same(Book.defineFields({
        name: 'text',
        level: 'not used yet',
        withDef: {type: 'any', default: 0},
      }), Book);

      tsc = new Book({name: 'abc'});

      assert.same(tsc.name, 'abc');

      assert.same(tsc.withDef, 0);

      tsc.name = 'john';
      tsc.attributes.level = 4;
      tsc.withDef = 'set';

      assert.same(tsc.level, 4);
      assert.same(tsc.withDef, 'set');

      tsc.withDef = null;
      assert.same(tsc.withDef, 0);

      tsc.withDef = undefined;
      assert.same(tsc.withDef, 0);

      tsc = new Book({name: 'foo', withDef: 1});
      assert.same(tsc.withDef, 1);
    });
  });
});
