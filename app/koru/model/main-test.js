define(function (require, exports, module) {
  /**
   * Object persistence manager. Defines application models.
   **/
  const koru     = require('koru');
  const dbBroker = require('koru/model/db-broker');
  const Query    = require('koru/model/query');
  const session  = require('koru/session');
  const api      = require('koru/test/api');
  const util     = require('koru/util');
  const TH       = require('./test-helper');
  const val      = require('./validation');

  const Model    = require('./main');
  var test, v;
  const {BaseModel} = Model;

  const Module = module.constructor;

  val.register(module, {required: require('./validators/required-validator')});


  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module(null, 'Model');
    },

    tearDown() {
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
      test.stub(koru, 'onunload');

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

      koru.onunload.yield();

      refute(Model.TestModel);

    },

    "BaseModel": {
      setUp() {
        v.bmApi = api.innerSubject("BaseModel", null, {
          abstract() {
            /**
             * The base class for all models
             **/
          }
        });
      },

      "test using a class"() {
        /**
         * Define and register a model.
         *
         * @param {Module} [module] needed to auto unload module when file changed

         * @param {string} [name] name of model. Defaults to derived from module name.

         * @param {object} [fields] call defineFields with fields

         * @returns the model
         **/
        v.bmApi.method("define");

        test.stub(koru, 'onunload');

        const module = new TH.MockModule("test-model-server");

        v.bmApi.example(() => {
          class TestModel extends BaseModel {
            foo() {return this.name;}
          }

          TestModel.define({
            module,
            fields: {name: 'text'},
          });

          assert.same(Model.TestModel, TestModel);
          assert.same(TestModel.modelName, 'TestModel');

          let tm = TestModel.create({name: 'my name'});

          assert.same(tm.foo(), 'my name');
        });

        const TestModel = Model.TestModel;

        assert.calledWith(koru.onunload, module, TH.match.func);

        koru.onunload.yield();

        refute(Model.TestModel);
      },

      "test onChange"() {
      /**
       * Observe change to model.
       *
       * @param callback is called the arguments `(now, was, [flag])`
       *
       * * if record was added: `now` will be a model instance and was
       * will be `null`.

       * * if record was changed: `now` will be a model instance with
       * the changes and `was` will be a map of changes with the
       * previous values.

       * * if record was removed: `now` will be null and `was` will be
       * a model instance before the remove.

       * * `flag` is only present on client and a truthy value
       * indicates change was not a simulation.

       * @return contains a stop method to stop observering
       **/
        class TestModel extends BaseModel {

        }
        TestModel.define({name: 'TestModel', fields: {name: 'text', age: 'number'}});

        v.bmApi.protoMethod('onChange', TestModel);

        this.onEnd(TestModel.onChange(v.oc = this.stub()));

        const ondra = TestModel.create({_id: 'm123', name: 'Ondra', age: 21});
        const matchOndra = TH.match.field('_id', ondra._id);
        assert.calledWith(v.oc, ondra, null);


        ondra.$update('age', 22);
        assert.calledWith(v.oc, matchOndra, {age: 21});

        ondra.$remove();
        assert.calledWith(v.oc, null, matchOndra);
      },
    },

    'with model lock': {
      setUp() {
        v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
      },

      "test nesting"() {
        try {
          v.TestModel.lock("a", function () {
            try {
              v.TestModel.lock("a", function () {
                assert.isTrue(v.TestModel.isLocked("a"));
                throw new Error("catch me");
              });
            } catch(ex) {
              assert.isTrue(v.TestModel.isLocked("a"));
              throw ex;
            }
            TH.fail("should not reach here");
          });
        } catch (ex) {
          if (ex.message !== "catch me")
            throw ex;
        }

        assert.isFalse(v.TestModel.isLocked("a"));
      },

      "test Exception unlocks"() {
        try {
          v.TestModel.lock("a", function () {
            assert.isTrue(v.TestModel.isLocked("a"));
            throw new Error("catch me");
          });
        } catch (ex) {
          if (ex.message !== "catch me")
            throw ex;
        }

        assert.isFalse(v.TestModel.isLocked("a"));
      },

      "test isLocked"() {
        v.TestModel.lock("a", function () {
          v.isLocked_a = v.TestModel.isLocked("a");
          v.isLocked_b = v.TestModel.isLocked("b");
        });

        assert.isTrue(v.isLocked_a);
        assert.isFalse(v.isLocked_b);
        assert.isFalse(v.TestModel.isLocked("a"));
      },
    },

    'with observering': {
      setUp() {
        v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
        v.tc = v.TestModel.create({name: 'foo'});

        v.obs = {};
        v.TestModel.beforeCreate(v.TestModel, obCalled);
        v.TestModel.beforeUpdate(v.TestModel, obCalled);
        v.TestModel.beforeSave(v.TestModel, obCalled);
        v.TestModel.afterLocalChange(v.TestModel, function (doc, was) {
          (v.obs.afterLocalChange = v.obs.afterLocalChange || [])
            .push([doc && util.merge({}, doc.attributes), was &&
                   util.merge({}, doc ? was : was.attributes)]);
        });
        v.TestModel.whenFinally(v.TestModel, function (doc, ex) {
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
        v.TestModel2 = Model.define('TestModel2').defineFields({age: 'number'});
        test.onEnd(() =>  Model._destroyModel('TestModel2', 'drop'));

        v.TestModel2.beforeCreate(v.TestModel, v.cb = test.stub());

        v.TestModel.create({name: 'foo'});
        assert.calledWith(v.cb, TH.match(doc => doc.name === 'foo'), 'beforeCreate');
        v.cb.reset();
        Model._destroyModel('TestModel2', 'drop');

        v.TestModel.create({name: 'bar'});
        refute.called(v.cb);
      },


      "test remove calls"() {
        test.onEnd(v.TestModel.onChange(v.onChange = test.stub()));
        v.TestModel.afterLocalChange(v.TestModel, v.afterLocalChange = test.stub());

        v.tc.$onThis.remove();

        assert.calledOnceWith(v.afterLocalChange, null, TH.matchModel(v.tc));
        assert.calledOnceWith(v.onChange, null, TH.matchModel(v.tc));
        assert(v.afterLocalChange.calledBefore(v.onChange));

        assert.equals(v.obs.afterLocalChange, [[null, {name: 'foo', _id: v.tc._id}]]);
      },

      "test update calls"() {
        test.onEnd(v.TestModel.onChange(function (doc, was) {
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
        test.onEnd(v.TestModel.onChange(v.onChange = test.stub()).stop);

        v.tc = v.TestModel.create({name: 'foo'});
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
        v.TestModel.beforeCreate(v.TestModel, function () {throw v.ex = new Error("tex")});

        assert.exception(function () {
          v.tc = v.TestModel.create({name: 'foo'});
        }, 'Error', 'tex');

        assert.equals(v.obs.whenFinally, [[TH.match(function (x) {return x.name === 'foo'}),
                                           v.ex]]);
      },

      "test update exception"() {
        v.TestModel.beforeUpdate(v.TestModel, function () {throw v.ex = new Error("tex")});

        assert.exception(function () {
          v.tc.name = 'bar';
          v.tc.$save();
        }, 'Error', 'tex');

        assert.equals(v.obs.whenFinally, [[TH.matchModel(v.tc), v.ex]]);
      },
    },

    'with versioning': {
      setUp() {
        v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
      },

      "test no _version"() {
        const tc = v.TestModel.create({name: 'foo'});

        assert.same(tc._version, undefined);
      },

      "test updating"() {
        v.TestModel.addVersioning();

        const tc = v.TestModel.create({name: 'foo'});

        assert.same(tc._version, 1);

        tc.name = 'bar';
        tc.$save();

        assert.same(tc.$reload()._version, 2);
      },

      "test bumping"() {
        v.TestModel.addVersioning();

        const tc = v.TestModel.create({name: 'foo'});

        tc.$bumpVersion();

        assert.same(tc.$reload()._version, 2);

        tc.$bumpVersion();
        assert.same(tc.$reload()._version, 3);
      },
    },

    "test ref cache"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      const foo = TestModel.create();

      foo.$cacheRef('bin')["123"] = 5;

      assert.same(foo.$cacheRef('bin')["123"], 5);

      assert.same(foo.$reload().$cacheRef('bin')["123"], undefined);

      foo.$cacheRef('bin')["123"] = 7;
      assert.same(foo.$cacheRef('bin')["123"], 7);

      foo.$clearCache();

      assert.same(foo.$reload().$cacheRef('bin')["123"], undefined);
    },

    "test cache"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      const foo = TestModel.create();

      foo.$cache.boo = 5;

      assert.same(foo.$cache.boo, 5);

      assert.same(foo.$reload().$cache.boo, undefined);
    },

    'test change recording'() {
      const TestModel = Model.define('TestModel').
              defineFields({
                name: 'text',
                other: 'number'
              });

      const testAttrs = {_id: 123, name: 'orig name'};
      const tsc = new TestModel(testAttrs);

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
      const TestModel = Model.define('TestModel');
      TestModel.defineFields({name: 'text'});
      const doc = TestModel.build({name: 'foo'}).$$save();

      assert.isTrue(TestModel.exists({_id: doc._id}));

      doc.$remove();

      assert.same(TestModel.findById(doc._id), undefined);
    },

    'with TestModel': {
      setUp() {
        v.TestModel = Model.define('TestModel', {t1: 123, authorize() {}});
        v.TestModel.defineFields({name: 'text', foo: 'jsonb'});
      },

      "test remote."() {
        /**
         * Define multiple Remote updating Procedure calls prefixed by model's
         * name.
         **/
        api.protoMethod('remote');
        v.TestModel.remote({
          move() {},
          expire() {},
        });

        assert(session.isRpc('TestModel.move'));
        refute(session.isRpcGet('TestModel.move'));

        assert(session.isRpc('TestModel.expire'));
      },

      "test remoteGet"() {
        /**
         * Define multiple Remote inquiry Procedure calls prefixed by
         * model's name.
         **/
        api.protoMethod('remoteGet');
        v.TestModel.remoteGet({
          list() {},
          show() {},
        });

        assert(session.isRpc('TestModel.list'));
        assert(session.isRpcGet('TestModel.list'));

        assert(session.isRpcGet('TestModel.show'));
      },

      "test accessor"() {
        v.TestModel.defineFields({
          starSign: {type: 'text', accessor: {get() {
            const ans = v.TestModel.getField(this, 'starSign');
            return ans === 'Gemini' ? 'Virgo' : ans;
          }}},
          luckyNumber: ({type: 'number', accessor: {set(value) {
            v.TestModel.setField(this, 'luckyNumber', value === 13 ? 7 : value);
          }}})
        });

        const sut = v.TestModel.build();
        sut.starSign = 'Gemini';
        assert.same(sut.changes.starSign, 'Gemini');
        assert.same(sut.starSign, 'Virgo');
        sut.starSign = 'Taurus';
        assert.same(sut.starSign, 'Taurus');

        sut.luckyNumber = 13;
        assert.same(sut.luckyNumber, 7);
        sut.luckyNumber = 3;
        assert.same(sut.luckyNumber, 3);
        v.TestModel.setField(sut, 'luckyNumber', 42);
        assert.same(sut.changes.luckyNumber, 42);
        assert.same(v.TestModel.getField(sut, 'luckyNumber'), 42);
      },

      "test changesTo"() {
        let res = v.TestModel.changesTo(
          "foo", v.doc = {foo: {123: {name: 'y'}}},
          v.was = {baz: "x.y.z", "foo.123.name": 'x', "foo.456.age": 4});

        assert.equals(res, {123: 'foo.123.name', 456: 'foo.456.age'});
        assert.same(v.TestModel.changesTo("foo", v.doc, v.was), res);

        res = v.TestModel.changesTo("baz", v.doc, v.was);
        assert.equals(res, 'upd');

        assert.equals(v.TestModel.changesTo("daz", v.doc, v.was), undefined);

        assert.equals(v.TestModel.changesTo("daz", {daz: 123}, {daz: undefined}), 'upd');
        assert.equals(v.TestModel.changesTo("daz", {attributes: {daz: 123}}, null), 'add');
        assert.equals(v.TestModel.changesTo("daz", null, {attributes: {daz: 123}}), 'del');
      },

      "test classMethods"() {
        const doc = v.TestModel.build();
        assert.same(doc.constructor, doc.classMethods);
      },

      "test _id"() {
        assert.equals(v.TestModel.$fields._id, {type: 'id'});

        const doc = new v.TestModel({_id: "attrId"});

        assert.same(doc._id, "attrId");

        doc.changes._id = "chgId";
        assert.same(doc._id, "attrId");


        doc.attributes._id = null;
        assert.same(doc._id, "chgId");
      },

      "test exists"() {
        const doc = v.TestModel.create({name: 'foo'});

        assert.isTrue(v.TestModel.exists(doc._id));

        assert.isFalse(v.TestModel.exists('bad'));
      },

      "test query"() {
        const query = v.TestModel.query;

        assert.same(query.model, v.TestModel);
      },

      "test $onThis"() {
        const sut = v.TestModel.create();

        const query = sut.$onThis;

        assert.same(query.model, v.TestModel);
        assert.same(query.singleId, sut._id);
      },

      "test where"() {
        const query = v.TestModel.where('t1', 123);

        assert.same(query.model, v.TestModel);
        assert.equals(query._wheres, {t1: 123});
      },

      "test findById"() {
        const doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        assert[isClient ? 'same' : 'equals'](v.TestModel.findById(doc._id).attributes, doc.attributes);
      },

      "test findAttrsById"() {
        const doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        const attrs = v.TestModel.findAttrsById(doc._id);
        assert.same(attrs, v.TestModel.findById(doc._id).attributes);
      },

      "test findBy."() {
        const doc = v.TestModel.create({name: 'Sam', foo: 'bar'});

        assert[isClient ? 'same' : 'equals'](v.TestModel.findBy('foo', 'bar')
                                             .attributes, doc.attributes);
      },

      "test validator passing function"() {
        v.TestModel.defineFields({baz: {type: 'text', required(field, options) {
          assert.same(this, doc);
          assert.same(field, 'baz');
          assert.same(options.type, 'text');
          return v.answer;
        }}});

        const doc = v.TestModel.build({baz: ''});

        v.answer = false;
        assert(doc.$isValid());

        v.answer = true;
        refute(doc.$isValid());
      },

      "test withChanges on objects"() {
        /**
         * Return a doc representing this doc with the supplied changes
         * staged against it such that calling doc.$save will apply the changes.
         *
         * If this method is called again with the same changes object
         * then a cached version of the before doc is returned.
         */

        v.TestModel.defineFields({queen: 'text'});

        const doc = new v.TestModel({
          _id: "123", foo: {bar: {baz: 'new val', buzz: 5}, fnord: {a: 1}}});

        assert.same(doc.$withChanges(), null);


        let was = {$partial: {
          foo: [
            "bar.baz.$partial", ['$match', 'new val', '$patch', [0,3,"orig"]],
            "bar.buzz", 2,
            'fnord.a', 2],
          queen: ['$replace', 'Mary'],
        }};
        let old = doc.$withChanges(was);

        assert.same(old.foo.bar.baz, "orig val");
        assert.same(old.foo.bar.buzz, 2);
        assert.same(old.queen, "Mary");

        assert.same(doc.foo.bar.baz, 'new val');
        assert.same(doc.foo.bar.buzz, 5);
        assert.same(doc.foo.fnord.a, 1);

        assert.same(doc.$withChanges(was), old);

        was = {$partial: {
          foo: [
            "bar.baz", null,
            "bar.buzz", 2,
            'fnord.a', 2],
          queen: ['$replace', null],
        }};

        old = doc.$withChanges(was);

        assert.same(old.foo.bar.baz, undefined);
        assert.same(old.foo.bar.buzz, 2);
        assert.same(old.queen, undefined);
      },


      "test $asChanges"() {
        /**
         * Use the {beforeChange} keys to extract the new values.
         *
         * @returns new hash of extracted values.
         */
        const beforeChange = {a: 1, b: 2, c: 3, $partial: {e: ["1.f", 42]}};
        const doc = new v.TestModel({_id: "1", a: 2, b: undefined, d: 4, e: [1, {f: 69}]});

        const changes = doc.$asChanges(beforeChange);

        assert.equals(changes, {a: 2, b: null, c: null, e: [1, {f: 69}]});

        // should not alter passed in arguments
        assert.equals(beforeChange, {a: 1, b: 2, c: 3, $partial: {e: ["1.f", 42]}});
        assert.equals(doc.attributes, {_id: "1", a: 2, b: undefined, d: 4, e: [1, {f: 69}]});
      },

      "test change"() {
        const doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        doc.$change('foo').bar.baz = "new";

        const bar = doc.foo.bar;

        assert.equals(doc.changes, {foo: {bar: {baz: 'new'}}});
        assert.equals(doc.attributes.foo, {bar: {baz: 'orig'}});

        doc.$change('foo').fnord = 123;
        doc.$change('foo').bar.boo = "me too";


        assert.equals(bar, {baz: 'new', boo: "me too"});

        assert.equals(doc.changes, {foo: {bar: {baz: 'new', boo: "me too"}, fnord: 123}});
        assert.equals(doc.attributes.foo, {bar: {baz: 'orig'}});
      },

      "test can override and save invalid doc"() {
        v.TestModel.defineFields({bar: {type: 'text', required: true}});
        const foo = v.TestModel.build({bar: null});

        foo.$save('force');

        assert(v.TestModel.findById(foo._id));
      },

      "test must be valid save "() {
        TH.noInfo();
        v.TestModel.defineFields({bar: {type: 'text', required: true}});
        const foo = v.TestModel.build();

        assert.invalidRequest(function () {
          foo.$$save();
        });

        foo.bar = 'okay';
        foo.$$save();

        assert.same(foo.$reload().bar, 'okay');
      },

      'test timestamps'() {
        v.TestModel.defineFields({createdAt: 'auto_timestamp', updatedAt: 'auto_timestamp',});

        assert.equals(v.TestModel.createTimestamps, {createdAt: true});
        assert.equals(v.TestModel.updateTimestamps, {updatedAt: true});

        v.now = Date.now()+1234;
        this.intercept(util, 'dateNow', ()=>v.now);

        const doc = v.TestModel.create({name: 'testing'});

        assert(doc._id);

        assert.same(+doc.createdAt, v.now);

        const oldCreatedAt = v.now - 2000;

        doc.createdAt = oldCreatedAt;
        doc.updatedAt = oldCreatedAt;
        doc.$$save();

        doc.$reload();

        doc.name = 'changed';
        doc.$save();

        doc.$reload();

        assert.same(+doc.createdAt, +oldCreatedAt);
        refute.same(+doc.updatedAt, +oldCreatedAt);

        v.now += 4000;
        doc.$update({name: 'changed again'});

        doc.$reload();

        assert.same(+doc.createdAt, +oldCreatedAt);
        assert.same(+doc.updatedAt, v.now);
      },

      "belongs_to": {
        setUp() {
          v.Qux = Model.define('Qux').defineFields({name: 'text'});
          test.onEnd(function () {Model._destroyModel('Qux', 'drop')});
          v.qux = v.Qux.create({name: "qux"});
        },

        tearDown() {
          Model._destroyModel('Qux', 'drop');
        },

        "test belongs_to_dbId"() {
          v.TestModel.defineFields({
            qux_id: {type: 'belongs_to_dbId'},
            name: 'text',
          });

          const sut = v.TestModel.create({name: 'sam'});
          assert.equals(sut.$reload().attributes, {name: 'sam', _id: TH.match.any});
          assert.same(sut.qux_id, dbBroker.dbId);

          v.Qux.create({name: 'dbQux', _id: 'default'});

          assert.same(sut.qux.name, "dbQux");
        },

        "test accessor"() {
          v.TestModel.defineFields({qux_id: {type: 'belongs_to'}});

          const sut = v.TestModel.build();
          sut.qux_id = '';
          assert.same(sut.changes.qux_id, undefined);
        },

        "test belongs_to auto"() {
          v.TestModel.defineFields({qux_id: {type: 'belongs_to'}});

          const sut = v.TestModel.build({qux_id: v.qux._id});

          const quxFind = test.spy(v.Qux, 'findById');

          assert.same(sut.qux.name, "qux");
          assert.same(sut.qux.name, "qux");
          assert.same(v.TestModel.$fields.qux_id.model, v.Qux);

          assert.calledOnce(quxFind);
        },

        "test belongs_to manual name"() {
          v.TestModel.defineFields({baz_id: {type: 'belongs_to', modelName: 'Qux'}});

          const sut = v.TestModel.build({baz_id: v.qux._id});

          assert.same(sut.baz.name, "qux");
        },

        "test belongs_to manual model"() {
          v.TestModel.defineFields({baz_id: {type: 'belongs_to', model: v.Qux}});

          const sut = v.TestModel.build({baz_id: v.qux._id});

          assert.same(sut.baz.name, "qux");
        },
      },

      "test hasMany"() {
        function fooFinder(query) {
          v.doc = this;
          v.query = query;
        }

        // exercise
        v.TestModel.hasMany('foos', {query: v.expectQuery = {where: test.stub()}}, fooFinder);

        const sut = new v.TestModel({_id: 'sut123'});

        assert.same(sut.foos, v.query);
        assert.same(v.query, v.expectQuery);
        assert.same(v.doc, sut);

      },

      'test user_id_on_create'() {
        v.User = Model.define('User');
        test.onEnd(function () {
          Model._destroyModel('User', 'drop');
        });
        v.TestModel.defineFields({user_id: 'user_id_on_create'});

        assert.equals(v.TestModel.userIds, { user_id: 'create' });

        TH.login("u1234", function () {
          const doc = v.TestModel.create({name: 'testing'});

          assert(doc._id);

          assert.same(doc.user_id, util.thread.userId);

          let id;
          session.rpc('save', 'TestModel', null, {_id: id = "123456", name: 'testing'} );
          assert.same(v.TestModel.findById(id).user_id, util.thread.userId);

          assert.same(v.TestModel.create({user_id: 'override'}).$reload().user_id, 'override');
        });
      },

      "test field accessor false"() {
        v.TestModel.defineFields({fuzz: {type: 'text', accessor: false}});
        const doc = v.TestModel.build({fuzz: 'bar'});

        assert.same(doc.fuzz, undefined);
        assert.same(doc.changes.fuzz, 'bar');
        assert.same(v.TestModel.$fields.fuzz.accessor, false);
      },

      'test equality'() {
        const OtherClass = Model.define('OtherClass'),
              a = new v.TestModel(),
              b = new v.TestModel(),
              c = new OtherClass();

        test.onEnd(function () {Model._destroyModel('OtherClass', 'drop')});

        refute.isTrue(a.$equals(b));

        a.attributes._id = "hello";

        refute.isTrue(a.$equals(b));

        b.attributes._id = a._id;
        c.attributes._id = a._id;

        assert.isTrue(a.$equals(b));
        refute.isTrue(a.$equals(c));
        refute.isTrue(a.$equals(null));
      },

      'test create'() {
        const attrs = {name: 'testing'};

        isClient && this.spy(session, "rpc");
        const doc = v.TestModel.create(attrs);
        refute.same(doc.changes,doc.attributes);
        assert.equals(doc.changes,{});

        attrs._id = doc._id;

        assert[isClient ? 'same' : 'equals'](doc.attributes,
                                             v.TestModel.findById(doc._id).attributes);

        if(isClient)
          assert.calledOnceWith(session.rpc, 'save', 'TestModel', null, {
            _id: doc._id, name: "testing"});
      },

      "test $savePartial"() {
        const doc = v.TestModel.create({_id: '123', name: 'testing'});
        this.stub(doc, '$save').returns('answer');
        const ans = doc.$savePartial('name', ['$append', '.sfx'], 'foo', ['bar', 'abc']);
        assert.equals(ans, 'answer');

        assert.equals(doc.changes, {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}});
      },

      "test $$savePartial"() {
        const doc = v.TestModel.create({_id: '123', name: 'testing'});
        this.stub(doc, '$save').returns('answer');;
        const ans = doc.$$savePartial('name', ['$append', '.sfx'], 'foo', ['bar', 'abc']);
        assert.equals(ans, 'answer');

        assert.equals(doc.changes, {$partial: {name: ['$append', '.sfx'], foo: ['bar', 'abc']}});

        assert.calledWith(doc.$save, 'assert');
      },

      "test duplicate id"() {
        const doc = v.TestModel.create({_id: '123', name: 'testing'});

        assert.exception(() => {
          v.TestModel.create({_id: '123', name: 'testing2'});
        });
      },

      "test $reload on removed doc"() {
        const doc = v.TestModel.create({name: 'old'});

        doc.$remove();

        assert.same(doc.$reload(), doc);

        assert.equals(doc.attributes, {});
      },

      "test $clearChanges"() {
        const doc = new v.TestModel({_id: 't1', name: 'foo'});

        const changes = doc.changes;
        doc.$clearChanges();

        assert.same(doc.changes, changes);

        doc.changes.name = 'bar';

        doc.$clearChanges();

        refute.same(doc.changes, changes);

        assert(util.isObjEmpty(doc.changes));
      },

      'test update'() {
        const doc = v.TestModel.create({name: 'old'});

        isClient && this.spy(session, "rpc");

        doc.name = 'new';
        doc.$save();
        assert.same(doc.name, 'new');

        doc.$reload();
        assert.same(doc.name, 'new');
        assert.equals(doc.changes,{});

        assert[isClient ? 'same' : 'equals'](doc.attributes, v.TestModel
                                             .findById(doc._id).attributes);

        if(isClient)
          assert.calledOnceWith(session.rpc,'save', 'TestModel', doc._id, {name: "new"});
      },

      'test build'() {
        const doc = v.TestModel.create();
        const copy = v.TestModel.build(doc.attributes);

        refute.same(doc.attributes, copy.changes);
        assert.same(doc.name, copy.name);

        assert.equals(copy._id, null);
        assert.equals(copy.changes._id, null);
      },

      'test setFields'() {
        v.TestModel.defineFields({a: 'text', d: 'text', notme: 'text', _version: 'number'});
        const sut = new v.TestModel();


        const result = sut.$setFields(['a','d','notdefined','_id', '_version'],{
          a: 'aa',d: 'dd', notdefined: 'set', notme: 'nm', _id: 'noset', _version: 5,
        });

        assert.same(result, sut);

        assert.equals(sut.changes,{a: 'aa',d: 'dd'});

        assert.same(sut.notdefined,'set');

      },

      "test $inspect"() {
        const doc = new v.TestModel({_id: 'id123', name: 'bar'});
        assert.equals(doc.$inspect(), '{Model: TestModel_id123 bar}');
      },

      "test toId"() {
        const doc = new v.TestModel({_id: 'theId'});

        assert.same(v.TestModel.toId(doc), 'theId');
        assert.same(v.TestModel.toId('astring'), 'astring');
      },

      "test toDoc"() {
        const doc = new v.TestModel({_id: 'theId'});


        test.stub(v.TestModel, 'findById', function (id) {
          return "found " + id;
        });


        assert.same(v.TestModel.toDoc(doc)._id, 'theId');
        assert.same(v.TestModel.toDoc('astring'), 'found astring');
      },
    },

    "test define via module"() {
      test.stub(koru, 'onunload');
      const TestModel = Model.define({id: '/foo/test-model'}, {t1: 123});
      assert.same(Model.TestModel, TestModel);

      assert.calledWith(koru.onunload, {id: '/foo/test-model'}, TH.match.func);

      koru.onunload.yield();

      refute(Model.TestModel);
    },

    'test define with name'() {
      const TestModel = Model.define('TestModel', {t1: 123});

      const testAttrs = {_id: 123, name: 'orig name'};
      let tsc = new TestModel(testAttrs);

      assert.same(tsc.constructor, TestModel);
      assert.same(tsc.attributes, testAttrs);
      assert.same(tsc.t1, 123);

      assert.same(TestModel.defineFields({name: 'text',
                                          level: 'not used yet',
                                          withDef: {type: 'text', default: 0},
                                         }),
                  TestModel);

      tsc = new TestModel({name: 'abc'});

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
