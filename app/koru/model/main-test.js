define(function (require, exports, module) {
  var test, v;
  var koru = require('../main');
  var TH = require('./test-helper');
  var Model = require('./main');
  require('./validator!required');
  var util = TH.util;
  var session = require('../session/base');


  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
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

        v.obs = {};
        v.TestModel.beforeCreate(v.TestModel, v.beforeCreate = obCalled);
        v.TestModel.beforeUpdate(v.TestModel, v.beforeUpdate = obCalled);
        v.TestModel.beforeSave(v.TestModel, v.beforeSave = obCalled);

        function obCalled(doc, type) {
          (v.obs[type] = v.obs[type] || []).push([util.extend({}, doc.attributes), util.extend({}, doc.changes)]);
        }
      },

      "test remove calls": function () {
        var och = v.TestModel.onChange(v.onChange = test.stub());
        test.onEnd(function () {och.stop()});
        v.tc.$remove();

        assert.calledOnceWith(v.onChange, null, TH.matchModel(v.tc));
      },

      "test update calls": function () {
        var och = v.TestModel.onChange(function (doc, was) {
          refute(v.docAttrs);
          v.docAttrs = util.extend({}, doc.attributes);
          v.docChanges = util.extend({}, was);
        });
        test.onEnd(function () {och.stop()});

        v.tc.name = 'bar';
        v.tc.$save();

        assert.equals(v.docAttrs, {name: 'bar', _id: v.tc._id});
        assert.equals(v.docChanges, {name: 'foo'});

        assert.equals(v.obs.beforeUpdate, [[{name: 'foo', _id: v.tc._id}, {name: 'bar'}]]);
        assert.equals(v.obs.beforeSave, [[{name: 'foo', _id: v.tc._id}, {name: 'bar'}]]);

        refute(v.obs.beforeCreate);
      },

      "test create calls": function () {
        var och = v.TestModel.onChange(v.onChange = test.stub());
        test.onEnd(function () {och.stop()});

        v.tc = v.TestModel.create({name: 'foo'});
        assert.calledOnceWith(v.onChange, TH.match(function (doc) {
          return doc.attributes === v.tc.attributes;
        }), null);

        assert.equals(v.obs.beforeCreate, [[{}, {name: 'foo', _id: v.tc._id}]]);
        assert.equals(v.obs.beforeSave, [[{}, {name: 'foo', _id: v.tc._id}]]);

        refute(v.obs.beforeUpdate);
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
      var TestModel = Model.define('TestModel');
      var sut = TestModel.create();

      sut.$remove();

      assert.same(TestModel.findById(sut._id), undefined);
    },

    'with TestModel': {
      setUp: function () {
        v.TestModel = Model.define('TestModel', {t1: 123, authorize: function () {}});
      },

      "test exists": function () {
        var doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        assert.isTrue(v.TestModel.exists(doc._id));

        assert.isFalse(v.TestModel.exists('bad'));
      },

      "test query": function () {
        var query = v.TestModel.query;

        assert.same(query.model, v.TestModel);
      },

      "test $onThis": function () {
        var sut = v.TestModel.create();

        var query = sut.$onThis;

        assert.same(query.model, v.TestModel);
        assert.same(query.singleId, sut._id);
      },

      "test where": function () {
        var query = v.TestModel.where('t1', 123);

        assert.same(query.model, v.TestModel);
        assert.equals(query._wheres, {t1: 123});
      },

      "test findById": function () {
        var doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        assert[isClient ? 'same' : 'equals'](v.TestModel.findById(doc._id).attributes, doc.attributes);
      },

      "test findByField": function () {
        var doc = v.TestModel.create({foo: 'bar'});

        assert[isClient ? 'same' : 'equals'](v.TestModel.findByField('foo', 'bar').attributes, doc.attributes);
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

      "test asBefore on objects": function () {
        v.TestModel.defineFields({foo: {type: 'has_many'}, queen: 'text'});

        var doc = new v.TestModel({_id: "123", foo: {bar: {baz: 'new val', buzz: 5}}});

        var was = {"foo.bar.baz": "orig", "foo.bar.buzz": 2, queen: 'Mary'};
        var old = doc.$asBefore(was);

        assert.same(old.foo.bar.baz, "orig");
        assert.same(old.foo.bar.buzz, 2);
        assert.same(old.queen, "Mary");

        assert.same(doc.$asBefore(was), old);
      },

      "test asBefore on array": function () {
        v.TestModel.defineFields({foo: {type: 'has_many'}});

        var doc = new v.TestModel({_id: "123", foo: []});
        var was = {"foo.1.bar": 3};

        var old = doc.$asBefore(was);

        assert.equals(old.foo, [, {bar: 3}]);

        doc.attributes.foo = [1, {bar: 3}];

        old = doc.$asBefore({"foo.0": undefined});
        assert.equals(old.foo, [{bar: 3}]);
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
        var foo = v.TestModel.build({bar: null});

        foo.$save('force');

        assert(v.TestModel.findById(foo._id));
      },

      "test must be valid save ": function () {
        test.stub(koru, 'info');
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
          test.onEnd(function () {Model._destroyModel('Foo', 'drop')});
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

      "test hasMany": function () {
        function fooFinder(query) {
          v.doc = this;
          v.query = query;
        }

        // exercise
        v.TestModel.hasMany('foos', {query: v.expectQuery = {where: test.stub()}}, fooFinder);

        var sut = new v.TestModel({_id: 'sut123'});

        assert.same(sut.foos, v.query);
        assert.same(v.query, v.expectQuery);
        assert.same(v.doc, sut);

      },

      'test user_id_on_create': function () {
        v.User = Model.define('User');
        test.onEnd(function () {
          Model._destroyModel('User', 'drop');
        });
        v.TestModel.defineFields({name: 'text', user_id: 'user_id_on_create'});

        assert.equals(v.TestModel.userIds, { user_id: 'create' });

        TH.login("u1234", function () {
          var doc = v.TestModel.create({name: 'testing'});

          assert(doc._id);

          assert.same(doc.user_id, util.thread.userId);

          var id;
          session.rpc('save', 'TestModel', id = "123456", {name: 'testing'} );
          assert.same(v.TestModel.findById(id).user_id, util.thread.userId);
        });
      },

      'test equality': function () {
        var OtherClass = Model.define('OtherClass'),
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

      'test create': function () {
        var attrs = {name: 'testing'};

        isClient && this.spy(session, "rpc");
        var doc = v.TestModel.create(attrs);
        refute.same(doc.changes,doc.attributes);
        assert.equals(doc.changes,{});

        attrs._id = doc._id;

        assert[isClient ? 'same' : 'equals'](doc.attributes, v.TestModel.findById(doc._id).attributes);

        if(isClient)
          assert.calledOnceWith(session.rpc, 'save', 'TestModel', doc._id,{_id: doc._id, name: "testing"});
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

        isClient && this.spy(session, "rpc");

        doc.name = 'new';
        doc.$save();
        assert.same(doc.name, 'new');

        doc.$reload();
        assert.same(doc.name, 'new');
        assert.equals(doc.changes,{});

        assert[isClient ? 'same' : 'equals'](doc.attributes, v.TestModel.findById(doc._id).attributes);

        if(isClient)
          assert.calledOnceWith(session.rpc,'save', 'TestModel', doc._id, {name: "new"});
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

    "test define via module": function () {
      test.stub(koru, 'onunload');
      var TestModel = Model.define({id: '/foo/test-model'}, {t1: 123});
      assert.same(Model.TestModel, TestModel);

      assert.calledWith(koru.onunload, {id: '/foo/test-model'}, TH.match.func);

      koru.onunload.yield();

      refute(Model.TestModel);
    },

    'test define with name': function () {
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
