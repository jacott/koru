// FIXME should be both client and server
isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');
  var sinon = TH.sinon;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      Model && TH.clearDB(); // remove old data (for Model building)
      Model._destroyModel('TestModel');
      v = null;
    },

    '//with model lock': {
      setUp: function () {
        v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
      },

      "test nesting": function () {
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
          v.ex = ex;
        }
        assert.same(v.ex.message, "catch me");

        assert.isFalse(v.TestModel.isLocked("a"));
      },

      "test Exception unlocks": function () {
        try {
          v.TestModel.lock("a", function () {
            assert.isTrue(v.TestModel.isLocked("a"));
            throw new Error("catch me");
          });
        } catch (ex) {
          assert.same(ex.message, "catch me");
        }

        assert.isFalse(v.TestModel.isLocked("a"));
      },

      "test isLocked": function () {
        v.TestModel.lock("a", function () {
          v.isLocked_a = v.TestModel.isLocked("a");
          v.isLocked_b = v.TestModel.isLocked("b");
        });

        assert.isTrue(v.isLocked_a);
        assert.isFalse(v.isLocked_b);
        assert.isFalse(v.TestModel.isLocked("a"));
      },
    },

    '//with observering': {
      setUp: function () {
        v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
        v.tc = v.TestModel.create({name: 'foo'});

        v.TestModel.afterCreate(v.afterCreate = test.stub());
        v.TestModel.afterUpdate(v.afterUpdate = test.stub());
        v.TestModel.afterSave(v.afterSave = test.stub());
        v.TestModel.beforeCreate(v.beforeCreate = test.stub());
        v.TestModel.beforeUpdate(v.beforeUpdate = test.stub());
        v.TestModel.beforeSave(v.beforeSave = test.stub());
        v.TestModel.afterRemove(v.afterRemove = test.stub());
      },

      "test remove calls": function () {
        v.afterRemove.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          v.afterRemoveId = doc._id;
        }));

        v.tc.$remove();

        assert.calledOnce(v.afterRemove);
        assert.same(v.tc._id, v.afterRemoveId);
      },

      "test update calls": function () {
        v.beforeSave.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          assert.equals(doc.changes, {name: 'bar'});
          v.beforeSaveId = doc._id;
        }));

        v.afterSave.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          assert.equals(doc.changes, {name: 'bar'});
          v.afterSaveId = doc._id;
        }));

        v.beforeUpdate.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          assert.equals(doc.changes, {name: 'bar'});
          v.beforeUpdateId = doc._id;
        }));

        v.afterUpdate.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          assert.equals(doc.changes, {name: 'bar'});
          v.afterUpdateId = doc._id;
        }));

        v.tc.name = 'bar';
        v.tc.$save();

        assert.calledOnce(v.beforeUpdate);
        assert.same(v.tc._id, v.beforeUpdateId);

        assert.calledOnce(v.afterUpdate);
        assert(v.tc._id, v.afterUpdateId);

        assert.calledOnce(v.beforeSave);
        assert.same(v.tc._id, v.beforeSaveId);

        assert.calledOnce(v.afterSave);
        assert(v.tc._id, v.afterSaveId);

        refute.called(v.afterCreate);
        refute.called(v.beforeCreate);
      },

      "test create calls": function () {
        v.beforeSave.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          assert.equals(doc.changes, {name: 'foo', _id: doc._id});
          v.beforeSaveId = doc._id;
        }));

        v.afterSave.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          assert.equals(doc.changes, {name: 'foo', _id: doc._id});
          v.afterSaveId = doc._id;
        }));

        v.beforeCreate.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          assert.equals(doc.changes, {name: 'foo', _id: doc._id});
          v.beforeCreateId = doc._id;
        }));

        v.afterCreate.withArgs(sinon.match(function (doc) {
          assert.equals(doc.attributes, {name: 'foo', _id: doc._id});
          assert.equals(doc.changes, {name: 'foo', _id: doc._id});
          v.afterCreateId = doc._id;
        }));

        v.tc = v.TestModel.create({name: 'foo'});
        assert.calledOnce(v.beforeCreate);
        assert.same(v.tc._id, v.beforeCreateId);

        assert.calledOnce(v.afterCreate);
        assert(v.tc._id, v.afterCreateId);

        assert.calledOnce(v.beforeSave);
        assert.same(v.tc._id, v.beforeSaveId);

        assert.calledOnce(v.afterSave);
        assert(v.tc._id, v.afterSaveId);

        refute.called(v.afterUpdate);
        refute.called(v.beforeUpdate);
      },
    },

    '//with versioning': {
      setUp: function () {
        v.TestModel = Model.define('TestModel').defineFields({name: 'text'});
      },

      "test no _version": function () {
        var tc = v.TestModel.create({name: 'foo'});

        assert.same(tc._version, undefined);
      },

      "test updating": function () {
        v.TestModel.addVersioning();

        var tc = v.TestModel.create({name: 'foo'});

        assert.same(tc._version, 1);

        tc.name = 'bar';
        tc.$save();

        assert.same(tc.$reload()._version, 2);
      },

      "test bumping": function () {
        v.TestModel.addVersioning();

        var tc = v.TestModel.create({name: 'foo'});

        tc.$bumpVersion();
        tc.$bumpVersion();

        assert.same(tc.$reload()._version, 2);

        tc.$bumpVersion();
        assert.same(tc.$reload()._version, 3);
      },
    },

    "test ref cache": function () {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});
      var foo = TestModel.create();

      foo.$cacheRef('bin')["123"] = 5;

      assert.same(foo.$cacheRef('bin')["123"], 5);

      assert.same(foo.$reload().$cacheRef('bin')["123"], undefined);

    },

    "test cache": function () {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});
      var foo = TestModel.create();

      foo.$cache.boo = 5;

      assert.same(foo.$cache.boo, 5);

      assert.same(foo.$reload().$cache.boo, undefined);
    },

    'test change recording': function () {
      var TestModel = Model.define('TestModel').
        defineFields({
          name: 'text',
          other: 'number'
        });

      var testAttrs = {_id: 123, name: 'orig name'};
      var tsc = new TestModel(testAttrs);

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
    },

    '//test remove': function () {
      var TestModel = Model.define('TestModel', {}, {saveRpc: true});
      var sut = TestModel.create();
      test.spy(TestModel, 'fencedRemove');

      sut.$remove();

      assert.calledWith(TestModel.fencedRemove, sut._id);

      assert.same(Model.TestModel.find().count(),0);
    },

    'with TestModel': {
      setUp: function () {
        v.TestModel = Model.define('TestModel', {t1: 123, authorize: function () {}}, {saveRpc: true});
      },

      "//test findById": function () {
        var doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        assert.same(doc.attributes, v.TestModel.findById(doc._id).attributes);
      },

      "//test validator passing function": function () {
        v.TestModel.defineFields({foo: {type: 'text', required: function (field, options) {
          assert.same(this, doc);
          assert.same(field, 'foo');
          assert.same(options.type, 'text');
          return v.answer;
        }}});

        var doc = v.TestModel.build({foo: ''});

        v.answer = false;
        assert(doc.$isValid());

        v.answer = true;
        refute(doc.$isValid());
      },

      "//test change": function () {
        v.TestModel.defineFields({foo: {type: 'has_many'}});

        var doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        doc.$change('foo').bar.baz = "new";

        var bar = doc.foo.bar;

        assert.equals(doc.changes, {foo: {bar: {baz: 'new'}}});
        assert.equals(doc.attributes.foo, {bar: {baz: 'orig'}});

        doc.$change('foo').fnord = 123;
        doc.$change('foo').bar.boo = "me too";


        assert.equals(bar, {baz: 'new', boo: "me too"});

        assert.equals(doc.changes, {foo: {bar: {baz: 'new', boo: "me too"}, fnord: 123}});
        assert.equals(doc.attributes.foo, {bar: {baz: 'orig'}});
      },

      "//test definePrototype": function () {
        v.TestModel.definePrototype('fooBar', fooBar);

        var baz = {_id: "123"};
        var called;

        var sut = v.TestModel.create();
        TH.login(function () {
          sut.fooBar(baz, "abc");
        });

        assert.isTrue(called);

        function fooBar(id, baz_id, qux) {
          assert.same(id, sut._id);

          assert.same(baz_id, "123");
          assert.same(qux, "abc");
          assert.same(this.userId, TH.userId());
          called = true;
        }
      },

      "//test update shortCut": function () {
        var doc = v.TestModel.create({name: 'testing'});

        doc.$update({$set: {name: 'changed'}});

        assert.same(doc.$reload().attributes.name, 'changed');
      },

      "//test can override and save invalid doc": function () {
        v.TestModel.defineFields({bar: {type: 'text', required: true}});
        var foo = v.TestModel.build();

        foo.$save('force');

        assert(v.TestModel.exists(foo._id));
      },

      "//test must be valid save ": function () {
        v.TestModel.defineFields({bar: {type: 'text', required: true}});
        var foo = v.TestModel.build();

        assert.invalidRequest(function () {
          foo.$$save();
        });

        foo.bar = 'okay';
        foo.$$save();

        assert.same(foo.$reload().bar, 'okay');
      },

      '//test findIds': function () {
        v.TestModel.defineFields({foo: 'text'});
        var exp_ids = [1,2,3].map(function (num) {
          return v.TestModel.docs.insert({foo: num});
        });

        assert.equals(v.TestModel.findIds().sort(), exp_ids.slice(0).sort());
        assert.equals(v.TestModel.findIds({foo: {$gt: 1}}).sort(), exp_ids.slice(1,4).sort());
        assert.equals(v.TestModel.findIds(null, {sort: {foo: -1}}), exp_ids.slice(0).reverse());
      },

      '//test timestamps': function () {
        v.TestModel.defineFields({name: 'text', createdAt: 'timestamp', updatedAt: 'timestamp',});

        assert.equals(v.TestModel.createTimestamps, { createdAt: true });
        assert.equals(v.TestModel.updateTimestamps, { updatedAt: true });

        var start = Date.now();

        var doc = v.TestModel.create({name: 'testing'});

        assert(doc._id);

        assert.between(+doc.createdAt, start, Date.now());

        var oldCreatedAt = new Date(start - 1000);

        v.TestModel.docs.update(doc._id, {$set: {createdAt: oldCreatedAt, updatedAt: oldCreatedAt}});

        doc.$reload();

        start = Date.now();

        doc.name = 'changed';
        doc.$save();

        doc.$reload();

        assert.same(+doc.createdAt, +oldCreatedAt);
        refute.same(+doc.updatedAt, +oldCreatedAt);
        assert.between(+doc.updatedAt, start, Date.now());
      },

      "//test belongs_to auto": function () {
        test.onEnd(function () {delete Model.Foo});
        var findStub = test.stub();
        findStub.withArgs("abc").returns({name: "qux"});
        Model.Foo = {findById: findStub};
        v.TestModel.defineFields({foo_id: {type: 'belongs_to'}});

        var sut = v.TestModel.build({foo_id: "abc"});

        assert.same(sut.foo.name, "qux");
        assert.same(sut.foo.name, "qux");

        assert.calledOnce(findStub);
      },

      "//test belongs_to manual": function () {
        test.onEnd(function () {delete Model.Foo});
        var findStub = test.stub();
        findStub.withArgs("abc").returns({name: "qux"});
        Model.Foo = {findById: findStub};
        v.TestModel.defineFields({baz_id: {type: 'belongs_to', modelName: 'Foo'}});

        var sut = v.TestModel.build({baz_id: "abc"});

        assert.same(sut.baz.name, "qux");
      },

      "//test hasMany": function () {
        var find = test.stub();

        find.returns("fail")
          .withArgs({$and: ["foreign_ref", "param"]}, {sort: 1}).returns("two args")
          .withArgs("foreign_ref", {transform: null}).returns("options only")
          .withArgs("foreign_ref").returns("no args");

        function fooFinder() {
          assert.same(this, sut);
          return "foreign_ref";
        }


        // exercise
        v.TestModel.hasMany('foos', {find: find}, fooFinder);

        var sut = new v.TestModel();

        assert.same(sut.foos(), "no args");
        assert.same(sut.foos("param" ,{sort: 1}), "two args");
        assert.same(sut.foos({}, {transform: null}), "options only");
        assert.same(sut.foos(null, {transform: null}), "options only");
      },

      '//test user_id_on_create': function () {
        v.TestModel.defineFields({name: 'text', user_id: 'user_id_on_create'});

        assert.equals(v.TestModel.userIds, { user_id: 'create' });

        TH.login(function () {
          var doc = v.TestModel.create({name: 'testing'});

          assert(doc._id);

          if (isServer) {
            // save doesn't have a userId
            assert.same(doc.user_id, undefined);
            // but the saveRpc does
            var id;
            App.rpc('TestModel.save', id = Random.id(), {name: 'testing'} );
            assert.same(v.TestModel.findOne(id).user_id, TH.userId());
          } else {
            assert.same(doc.user_id, TH.userId());
          }
        });
      },

      'test equality': function () {
        var OtherClass = Model.define('OtherClass'),
            a = new v.TestModel(),
            b = new v.TestModel(),
            c = new OtherClass();

        refute.isTrue(a.$equals(b));

        a.attributes._id = "hello";

        refute.isTrue(a.$equals(b));

        b.attributes._id = a._id;
        c.attributes._id = a._id;

        assert.isTrue(a.$equals(b));
        refute.isTrue(a.$equals(c));
        refute.isTrue(a.$equals(null));
      },

      '//test create': function () {
        this.spy(Model.TestModel.docs,'insert');
        var attrs = {name: 'testing'};

        this.spy(App, "rpc");
        var doc = v.TestModel.create(attrs);
        refute.same(doc.changes,doc.attributes);
        assert.equals(doc.changes,{});

        attrs._id = doc._id;
        assert.calledOnceWith(Model.TestModel.docs.insert,attrs);
        if(isClient)
          assert.calledOnceWith(App.rpc,'TestModel.save', doc._id,{_id: doc._id, name: "testing"});
        else
          refute.called(App.rpc);

      },

      "//test $reload on removed doc": function () {
        v.TestModel.defineFields({name: 'string'});
        var doc = v.TestModel.create({name: 'old'});

        doc.$remove();

        assert.same(doc.$reload(), doc);

        assert.equals(doc.attributes, {});
      },

      '//test update': function () {
        v.TestModel.defineFields({name: 'string'});
        var doc = v.TestModel.create({name: 'old'});

        this.spy(Model.TestModel,'fencedUpdate');
        this.spy(Model.TestModel.docs,'update');
        this.spy(App, "rpc");

        doc.name = 'new';
        doc.$save();


        doc.$reload();
        assert.same(doc.name, 'new');
        assert.equals(doc.changes,{});

        assert.calledOnceWith(Model.TestModel.fencedUpdate, doc._id, {$set: {name: 'new'}});
        assert.calledOnceWith(Model.TestModel.docs.update,doc._id,{$set: {name: 'new'}});
        if(isClient)
          assert.calledOnceWith(App.rpc,'TestModel.save', doc._id,{name: "new"});
        else
          refute.called(App.rpc);
      },

      '//test afterCreate callback': function () {
        var afterCreateStub = this.stub();
        Model.TestModel.afterCreate(afterCreateStub);

        var attrs = {name: 'testing'};

        var doc = v.TestModel.create(attrs);


        refute.same(doc.changes,doc.attributes);
        refute.same(doc.changes,attrs);

        attrs._id = doc._id;
        assert.calledOnce(afterCreateStub);

        assert.equals(afterCreateStub.getCall(0).args[0].attributes,doc.attributes);

        doc.name = 'new';
        doc.$save();

        assert.calledOnce(afterCreateStub);
      },


      'test build': function () {
        var doc = v.TestModel.create();
        var copy = v.TestModel.build(doc.attributes);

        refute.same(doc.attributes, copy.changes);
        assert.same(doc.name, copy.name);

        assert.same(copy._id, undefined);
        assert.same(copy.changes._id, undefined);
      },

      'test setFields': function () {
        v.TestModel.defineFields({a: 'text', d: 'text', notme: 'text'});
        var sut = new v.TestModel();


        var result = sut.$setFields(['a','d','notdefined','_id'],{a: 'aa',d: 'dd', notdefined: 'set', notme: 'nm', '_id': 'noset'});

        assert.same(result,sut);

        assert.equals(sut.changes,{a: 'aa',d: 'dd'});

        assert.same(sut.notdefined,'set');

      },

    },

    'test define': function () {
      var TestModel = Model.define('TestModel', {t1: 123});

      var testAttrs = {_id: 123, name: 'orig name'};
      var tsc = new TestModel(testAttrs);

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
    }
  });
});
