define(function (require, exports, module) {
  /**
   * Object persistence manager. Defines application models.
   **/
  const koru      = require('koru');
  const ModelEnv  = require('koru/env!./main');
  const BaseModel = require('koru/model/base-model');
  const api       = require('koru/test/api');
  const TH        = require('./test-helper');

  const {stub, spy, onEnd, util} = TH;

  const Model    = require('./main');
  let v = null;

  const Module = module.constructor;


  TH.testCase(module, {
    setUp() {
      v = {};
      api.module(null, 'Model');
    },

    tearDown() {
      Model._destroyModel('Book', 'drop');
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test only models enumerable"() {
      for (const key in Model) {
        assert.same(Object.getPrototypeOf(Model[key]), BaseModel);
      }
      assert(true);
    },

    "test auto define"() {
      stub(koru, 'onunload');

      const TestModel = Model.define({
        module: v.mod = {id: 'test-model'},
        fields: {name: 'text'},
        proto: {
          foo() {return this.name;}
        },
      });

      assert.calledWith(koru.onunload, v.mod, TH.match.func);

      assert.same(Model.TestModel, TestModel);
      assert.same(TestModel.modelName, 'TestModel');
      isServer && assert.same(TestModel.name, 'TestModel');


      let tm = TestModel.create({name: 'my name'});

      assert.same(tm.foo(), 'my name');
      koru.onunload.yieldAll();
      refute(Model.TestModel);

      ModelEnv.destroyModel(TestModel, 'drop');

    },

    'with model lock': {
      setUp() {
        v.Book = Model.define('Book').defineFields({name: 'text'});
      },

      "test nesting"() {
        try {
          v.Book.lock("a", function () {
            try {
              v.Book.lock("a", function () {
                assert.isTrue(v.Book.isLocked("a"));
                throw new Error("catch me");
              });
            } catch(ex) {
              assert.isTrue(v.Book.isLocked("a"));
              throw ex;
            }
            TH.fail("should not reach here");
          });
        } catch (ex) {
          if (ex.message !== "catch me")
            throw ex;
        }

        assert.isFalse(v.Book.isLocked("a"));
      },

      "test Exception unlocks"() {
        try {
          v.Book.lock("a", function () {
            assert.isTrue(v.Book.isLocked("a"));
            throw new Error("catch me");
          });
        } catch (ex) {
          if (ex.message !== "catch me")
            throw ex;
        }

        assert.isFalse(v.Book.isLocked("a"));
      },

      "test isLocked"() {
        v.Book.lock("a", function () {
          v.isLocked_a = v.Book.isLocked("a");
          v.isLocked_b = v.Book.isLocked("b");
        });

        assert.isTrue(v.isLocked_a);
        assert.isFalse(v.isLocked_b);
        assert.isFalse(v.Book.isLocked("a"));
      },
    },

    'with observering': {
      setUp() {
        v.Book = Model.define('Book').defineFields({name: 'text'});
        v.tc = v.Book.create({name: 'foo'});

        v.obs = {};
        v.Book.beforeCreate(v.Book, obCalled);
        v.Book.beforeUpdate(v.Book, obCalled);
        v.Book.beforeSave(v.Book, obCalled);
        v.Book.afterLocalChange(v.Book, function (doc, was) {
          (v.obs.afterLocalChange = v.obs.afterLocalChange || [])
            .push([doc && util.merge({}, doc.attributes), was &&
                   util.merge({}, doc ? was : was.attributes)]);
        });
        v.Book.whenFinally(v.Book, function (doc, ex) {
          (v.obs.whenFinally = v.obs.whenFinally || []).push([doc, ex]);
        });

        function obCalled(doc, type, partials) {
          const args = [util.merge({}, doc.attributes), util.merge({}, doc.changes)];
          if (partials !== undefined)
            args.push(util.merge({}, partials));
          (v.obs[type] = v.obs[type] || []).push(args);
        }
      },

      "test remove on destroy for another subject"() {
        v.Book2 = Model.define('Book2').defineFields({age: 'number'});
        onEnd(() =>  Model._destroyModel('Book2', 'drop'));

        v.Book2.beforeCreate(v.Book, v.cb = stub());

        v.Book.create({name: 'foo'});
        assert.calledWith(v.cb, TH.match(doc => doc.name === 'foo'), 'beforeCreate');
        v.cb.reset();
        Model._destroyModel('Book2', 'drop');

        v.Book.create({name: 'bar'});
        refute.called(v.cb);
      },


      "test remove calls"() {
        onEnd(v.Book.onChange(v.onChange = stub()));
        v.Book.afterLocalChange(v.Book, v.afterLocalChange = stub());

        v.tc.$onThis.remove();

        assert.calledOnceWith(v.afterLocalChange, null, TH.matchModel(v.tc));
        assert.calledOnceWith(v.onChange, null, TH.matchModel(v.tc));
        assert(v.afterLocalChange.calledBefore(v.onChange));

        assert.equals(v.obs.afterLocalChange, [[null, {name: 'foo', _id: v.tc._id}]]);
      },

      "test update calls"() {
        onEnd(v.Book.onChange(function (doc, was) {
          refute(v.docAttrs);
          v.docAttrs = util.merge({}, doc.attributes);
          v.docChanges = util.merge({}, was);
        }).stop);

        v.tc.name = 'bar';
        v.tc.$save();

        assert.equals(v.docAttrs, {name: 'bar', _id: v.tc._id});
        assert.equals(v.docChanges, {name: 'foo'});

        assert.equals(v.obs.beforeUpdate, [[{name: 'foo', _id: v.tc._id}, {name: 'bar'}]]);
        assert.equals(v.obs.beforeSave, [[{name: 'foo', _id: v.tc._id}, {name: 'bar'}]]);
        assert.equals(v.obs.afterLocalChange, [[{name: 'bar', _id: v.tc._id}, {name: 'foo'}]]);
        assert.equals(v.obs.whenFinally, [[TH.matchModel(v.tc), undefined]]);


        refute(v.obs.beforeCreate);
      },

      "test create calls"() {
        onEnd(v.Book.onChange(v.onChange = stub()).stop);

        v.tc = v.Book.create({name: 'foo'});
        assert.calledOnceWith(v.onChange, TH.match(function (doc) {
          return doc.attributes === v.tc.attributes;
        }), null);

        assert.equals(v.obs.beforeCreate, [[{}, {name: 'foo', _id: v.tc._id}]]);
        assert.equals(v.obs.beforeSave, [[{}, {name: 'foo', _id: v.tc._id}]]);
        assert.equals(v.obs.afterLocalChange, [[{name: 'foo', _id: v.tc._id}, null]]);
        assert.equals(v.obs.whenFinally, [[TH.matchModel(v.tc), undefined]]);

        refute(v.obs.beforeUpdate);
      },

      "test create exception"() {
        v.Book.beforeCreate(v.Book, function () {throw v.ex = new Error("tex")});

        assert.exception(function () {
          v.tc = v.Book.create({name: 'foo'});
        }, 'Error', 'tex');

        assert.equals(v.obs.whenFinally, [[TH.match(function (x) {return x.name === 'foo'}),
                                           v.ex]]);
      },

      "test update exception"() {
        v.Book.beforeUpdate(v.Book, function () {throw v.ex = new Error("tex")});

        assert.exception(function () {
          v.tc.name = 'bar';
          v.tc.$save();
        }, 'Error', 'tex');

        assert.equals(v.obs.whenFinally, [[TH.matchModel(v.tc), v.ex]]);
      },
    },

    'with versioning': {
      setUp() {
        v.Book = Model.define('Book').defineFields({name: 'text'});
      },

      "test no _version"() {
        const tc = v.Book.create({name: 'foo'});

        assert.same(tc._version, undefined);
      },

      "test updating"() {
        v.Book.addVersioning();

        const tc = v.Book.create({name: 'foo'});

        assert.same(tc._version, 1);

        tc.name = 'bar';
        tc.$save();

        assert.same(tc.$reload()._version, 2);
      },

      "test bumping"() {
        v.Book.addVersioning();

        const tc = v.Book.create({name: 'foo'});

        tc.$bumpVersion();

        assert.same(tc.$reload()._version, 2);

        tc.$bumpVersion();
        assert.same(tc.$reload()._version, 3);
      },
    },

    "test ref cache"() {
      const Book = Model.define('Book').defineFields({name: 'text'});
      const foo = Book.create();

      foo.$cacheRef('bin')["123"] = 5;

      assert.same(foo.$cacheRef('bin')["123"], 5);

      assert.same(foo.$reload().$cacheRef('bin')["123"], undefined);

      foo.$cacheRef('bin')["123"] = 7;
      assert.same(foo.$cacheRef('bin')["123"], 7);

      foo.$clearCache();

      assert.same(foo.$reload().$cacheRef('bin')["123"], undefined);
    },

    "test cache"() {
      const Book = Model.define('Book').defineFields({name: 'text'});
      const foo = Book.create();

      foo.$cache.boo = 5;

      assert.same(foo.$cache.boo, 5);

      assert.same(foo.$reload().$cache.boo, undefined);
    },

    'test change recording'() {
      const Book = Model.define('Book').
              defineFields({
                name: 'text',
                other: 'number'
              });

      const testAttrs = {_id: 123, name: 'orig name'};
      const tsc = new Book(testAttrs);

      tsc.name = 'orig name';
      assert.equals(tsc.changes,{});

      tsc.name = 'new name';
      assert.equals(tsc.changes,{name: 'new name'});

      tsc.name = 'another';
      assert.equals(tsc.changes,{name: 'another'});

      tsc.other = 'new other';
      assert.equals(tsc.changes,{name: 'another', other: 'new other'});

      tsc.name = 'orig name';
      assert.equals(tsc.changes,{other: 'new other'});

      assert.same(tsc.attributes,testAttrs);

      tsc.name = undefined;

      assert.same(tsc.name, undefined);

    },

    'test remove'() {
      const Book = Model.define('Book');
      Book.defineFields({name: 'text'});
      const doc = Book.build({name: 'foo'}).$$save();

      assert.isTrue(Book.exists({_id: doc._id}));

      doc.$remove();

      assert.same(Book.findById(doc._id), undefined);
    },

    "test define via module"() {
      stub(koru, 'onunload');
      const TestModel = Model.define({id: '/foo/test-model'}, {t1: 123});
      assert.same(Model.TestModel, TestModel);

      assert.calledWith(koru.onunload, {id: '/foo/test-model'}, TH.match.func);

      koru.onunload.yield();

      refute(Model.Book);
    },

    'test define with name'() {
      const Book = Model.define('Book', {t1: 123});

      const testAttrs = {_id: 123, name: 'orig name'};
      let tsc = new Book(testAttrs);

      assert.same(tsc.constructor, Book);
      assert.same(tsc.attributes, testAttrs);
      assert.same(tsc.t1, 123);

      assert.same(Book.defineFields({name: 'text',
                                          level: 'not used yet',
                                          withDef: {type: 'text', default: 0},
                                         }),
                  Book);

      tsc = new Book({name: 'abc'});

      assert.same(tsc.name, 'abc');

      assert.same(tsc.withDef, 0);

      tsc.name = 'john';
      tsc.attributes.level = 4;
      tsc.withDef = 'set';

      assert.same(tsc.level,4);
      assert.same(tsc.withDef,'set');

      tsc.withDef = null;
      assert.same(tsc.withDef,null);

      tsc.withDef = undefined;
      assert.same(tsc.withDef, 0);
    },
  });
});
