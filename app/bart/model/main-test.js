// FIXME should be both client and server
isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');
  require('../b!./validator:required');
  var sinon = TH.sinon;
  var util = TH.util;
  var session = require('../session/main');


  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      Model._destroyModel('TestModel');
      v = null;
    },

    'with model lock': {
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
          if (ex.message !== "catch me")
            throw ex;
        }

        assert.isFalse(v.TestModel.isLocked("a"));
      },

      "test Exception unlocks": function () {
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

    'with observering': {
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

    'with versioning': {
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

    'test remove': function () {
      var TestModel = Model.define('TestModel', {}, {saveRpc: true});
      var sut = TestModel.create();

      sut.$remove();

      assert.same(TestModel.findById(sut._id), undefined);
    },

    'with TestModel': {
      setUp: function () {
        v.TestModel = Model.define('TestModel', {t1: 123, authorize: function () {}}, {saveRpc: true});
      },

      "test findById": function () {
        var doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        assert.same(v.TestModel.findById(doc._id).attributes, doc.attributes);
      },

      "test validator passing function": function () {
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

      "test change": function () {
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

      "test definePrototypeMethod": function () {
        v.TestModel.definePrototypeMethod('fooBar', v.stub = test.stub());

        var baz = {_id: "123"};
        var called;

        var sut = v.TestModel.create();
        var rpcSpy = test.spy(session, 'rpc');
        sut.fooBar(baz, "abc");

        assert.calledWith(rpcSpy, 'TestModel.fooBar', sut._id, "123", "abc");

        assert.calledWith(v.stub, sut._id, "123", "abc");
      },

      "test can override and save invalid doc": function () {
        v.TestModel.defineFields({bar: {type: 'text', required: true}});
        var foo = v.TestModel.build();

        foo.$save('force');

        assert(v.TestModel.findById(foo._id));
      },

      "test must be valid save ": function () {
        v.TestModel.defineFields({bar: {type: 'text', required: true}});
        var foo = v.TestModel.build();

        assert.invalidRequest(function () {
          foo.$$save();
        });

        foo.bar = 'okay';
        foo.$$save();

        assert.same(foo.$reload().bar, 'okay');
      },

      'test timestamps': function () {
        v.TestModel.defineFields({name: 'text', createdAt: 'timestamp', updatedAt: 'timestamp',});

        assert.equals(v.TestModel.createTimestamps, { createdAt: true });
        assert.equals(v.TestModel.updateTimestamps, { updatedAt: true });

        var start = util.dateNow();

        var doc = v.TestModel.create({name: 'testing'});

        assert(doc._id);

        assert.between(+doc.createdAt, start, Date.now());

        var oldCreatedAt = new Date(start - 1000);

        doc.createdAt = oldCreatedAt;
        doc.updatedAt = oldCreatedAt;
        doc.$$save();

        doc.$reload()

        ;

        start = util.dateNow();

        doc.name = 'changed';
        doc.$save();

        doc.$reload();

        assert.same(+doc.createdAt, +oldCreatedAt);
        refute.same(+doc.updatedAt, +oldCreatedAt);
        assert.between(+doc.updatedAt, start, util.dateNow());
      },

      "belongs_to": {
        setUp: function () {
          v.Foo = Model.define('Foo').defineFields({name: 'text'});
          test.onEnd(function () {Model._destroyModel('Foo')});
          v.foo = v.Foo.create({name: "qux"});
        },

        "test belongs_to auto": function () {
          v.TestModel.defineFields({foo_id: {type: 'belongs_to'}});

          var sut = v.TestModel.build({foo_id: v.foo._id});

          var fooFind = test.spy(v.Foo, 'findById');

          assert.same(sut.foo.name, "qux");
          assert.same(sut.foo.name, "qux");

          assert.calledOnce(fooFind);
        },

        "test belongs_to manual": function () {
          v.TestModel.defineFields({baz_id: {type: 'belongs_to', modelName: 'Foo'}});

          var sut = v.TestModel.build({baz_id: v.foo._id});

          assert.same(sut.baz.name, "qux");
        },
      },

      'test user_id_on_create': function () {
        v.TestModel.defineFields({name: 'text', user_id: 'user_id_on_create'});

        assert.equals(v.TestModel.userIds, { user_id: 'create' });

        TH.login("u1234", function () {
          var doc = v.TestModel.create({name: 'testing'});

          assert(doc._id);

          if (isServer) {
            // save doesn't have a userId
            assert.same(doc.user_id, undefined);
            // but the saveRpc does
            var id;
            session.rpc('save', 'TestModel', id = "123456", {name: 'testing'} );
            assert.same(v.TestModel.findById(id).user_id, util.thread.userId);
          } else {
            assert.same(doc.user_id, util.thread.userId);
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

      'test create': function () {
        var attrs = {name: 'testing'};

        this.spy(session, "rpc");
        var doc = v.TestModel.create(attrs);
        refute.same(doc.changes,doc.attributes);
        assert.equals(doc.changes,{});

        attrs._id = doc._id;
        assert.same(doc.attributes, v.TestModel.findById(doc._id).attributes);
        if(isClient)
          assert.calledOnceWith(session.rpc, 'save', 'TestModel', doc._id,{_id: doc._id, name: "testing"});
        else
          refute.called(session.rpc);
      },

      "test $reload on removed doc": function () {
        v.TestModel.defineFields({name: 'string'});
        var doc = v.TestModel.create({name: 'old'});

        doc.$remove();

        assert.same(doc.$reload(), doc);

        assert.equals(doc.attributes, {});
      },

      'test update': function () {
        v.TestModel.defineFields({name: 'string'});
        var doc = v.TestModel.create({name: 'old'});

        this.spy(session, "rpc");

        doc.name = 'new';
        doc.$save();

        doc.$reload();
        assert.same(doc.name, 'new');
        assert.equals(doc.changes,{});

        assert.same(doc.attributes, v.TestModel.findById(doc._id).attributes);


        if(isClient)
          assert.calledOnceWith(session.rpc,'save', 'TestModel', doc._id,{name: "new"});
        else
          refute.called(session.rpc);
      },

      'test afterCreate callback': function () {
        var afterCreateStub = this.stub();
        v.TestModel.afterCreate(afterCreateStub);

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
