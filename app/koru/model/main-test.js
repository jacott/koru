define(function (require, exports, module) {
  var test, v;
  var koru = require('../main');
  var TH = require('./test-helper');
  var Model = require('./main');
  var val = require('./validation');

  val.register(module, {required: require('./validators/required-validator')});
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

    "test only models enumerable": function () {
      for(var key in Model) {
        assert.same(Model[key].constructor, Model);
      }
      assert(true);
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
        v.TestModel.beforeCreate(v.TestModel, obCalled);
        v.TestModel.beforeUpdate(v.TestModel, obCalled);
        v.TestModel.beforeSave(v.TestModel, obCalled);
        v.TestModel.afterLocalChange(v.TestModel, function (doc, was) {
          (v.obs.afterLocalChange = v.obs.afterLocalChange || []).push([doc && util.extend({}, doc.attributes), was && util.extend({}, doc ? was : was.attributes)]);
        });
        v.TestModel.whenFinally(v.TestModel, function (doc, ex) {
          (v.obs.whenFinally = v.obs.whenFinally || []).push([doc, ex]);
        });

        function obCalled(doc, type, partials) {
          var args = [util.extend({}, doc.attributes), util.extend({}, doc.changes)];
          if (partials !== undefined)
            args.push(util.extend({}, partials));
          (v.obs[type] = v.obs[type] || []).push(args);
        }
      },

      "test remove calls": function () {
        test.onEnd(v.TestModel.onChange(v.onChange = test.stub()));
        test.onEnd(v.TestModel.afterLocalChange(v.TestModel, v.afterLocalChange = test.stub()));

        v.tc.$onThis.remove();

        assert.calledOnceWith(v.onChange, null, TH.matchModel(v.tc));
        assert.calledOnceWith(v.afterLocalChange, null, TH.matchModel(v.tc));
        assert(v.afterLocalChange.calledBefore(v.onChange));

        assert.equals(v.obs.afterLocalChange, [[null, {name: 'foo', _id: v.tc._id}]]);
      },

      "test update calls": function () {
        test.onEnd(v.TestModel.onChange(function (doc, was) {
          refute(v.docAttrs);
          v.docAttrs = util.extend({}, doc.attributes);
          v.docChanges = util.extend({}, was);
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

      "test $put": function () {
          test.stub(koru, 'userId').returns('u123');
        v.TestModel.prototype.authorizePut = {x: test.stub()};

        v.tc.name = 'bar';
        v.tc.changes['x.y'] = 'abc';

        v.tc.$put(v.tc.changes);

        assert.equals(v.obs.beforeUpdate, [[{name: 'foo', _id: v.tc._id}, {name: 'bar'},
                                            {x: {'x.y': "abc"}}]]);
        assert.equals(v.obs.beforeSave, [[{name: 'foo', _id: v.tc._id}, {name: 'bar'},
                                          {x: {'x.y': "abc"}}]]);
        assert.equals(v.obs.afterLocalChange, [[{name: 'bar', _id: v.tc._id, x: {y: 'abc'}}, {name: 'foo',
                                                                               'x.y': undefined}]]);
        assert.equals(v.obs.whenFinally, [[TH.matchModel(v.tc), undefined]]);
      },

      "test create calls": function () {
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

      "test create exception": function () {
        v.TestModel.beforeCreate(v.TestModel, function () {throw v.ex = new Error("tex")});

        assert.exception(function () {
          v.tc = v.TestModel.create({name: 'foo'});
        }, 'Error', 'tex');

        assert.equals(v.obs.whenFinally, [[TH.match(function (x) {return x.name === 'foo'}),
                                           v.ex]]);
      },

      "test update exception": function () {
        v.TestModel.beforeUpdate(v.TestModel, function () {throw v.ex = new Error("tex")});

        assert.exception(function () {
          v.tc.name = 'bar';
          v.tc.$save();
        }, 'Error', 'tex');

        assert.equals(v.obs.whenFinally, [[TH.matchModel(v.tc), v.ex]]);
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

      tsc.name = undefined;

      assert.same(tsc.name, undefined);

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

      "test _id": function () {
        var doc = new v.TestModel({_id: "attrId"});

        assert.same(doc._id, "attrId");

        doc.changes._id = "chgId";
        assert.same(doc._id, "attrId");


        doc.attributes._id = null;
        assert.same(doc._id, "chgId");
      },

      "test $hasChanged": function () {
        v.TestModel.defineFields({name: 'text'});
        var doc = new v.TestModel({_id: "attrId"});

        assert.isFalse(doc.$hasChanged('name'));

        doc.name = 'new name';

        assert.isTrue(doc.$hasChanged('name'));

        assert.isFalse(doc.$hasChanged('na'));

        assert.isTrue(doc.$hasChanged('age', {"age.$+1": 0}));
        assert.isFalse(doc.$hasChanged('age.bob', {age: 5, "age.bob$+1": 0}));
        assert.isTrue(doc.$hasChanged('age.bob', {age: 5, "age.bob.$+1": 0}));
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

      "test findAttrsById": function () {
        var doc = v.TestModel.create({foo: {bar: {baz: 'orig'}}});

        var attrs = v.TestModel.findAttrsById(doc._id);
        assert.same(attrs, v.TestModel.findById(doc._id).attributes);
      },

      "test findBy": function () {
        var doc = v.TestModel.create({foo: 'bar'});

        assert[isClient ? 'same' : 'equals'](v.TestModel.findBy('foo', 'bar').attributes, doc.attributes);
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
        v.TestModel.defineFields({foo: {type: 'object'}, queen: 'text'});

        var doc = new v.TestModel({_id: "123", foo: {bar: {baz: 'new val', buzz: 5}, fnord: {a: 1}}});

        var was = {"foo.bar.baz": "orig", "foo.bar.buzz": 2, queen: 'Mary', 'foo.fnord.a': 2};
        var old = doc.$asBefore(was);

        assert.same(old.foo.bar.baz, "orig");
        assert.same(old.foo.bar.buzz, 2);
        assert.same(old.queen, "Mary");

        assert.same(doc.foo.bar.baz, 'new val');
        assert.same(doc.foo.bar.buzz, 5);
        assert.same(doc.foo.fnord.a, 1);

        assert.same(doc.$asBefore(was), old);
      },

      "test asBefore on arrays": function () {
        v.TestModel.defineFields({foo: {type: 'object'}});

        var doc = new v.TestModel({_id: 'f123', foo: ['f123']});
        var was = {'foo.$-1': 'f123'};
        var old = doc.$asBefore(was);
        assert.equals(old.foo, []);
      },

      "test asBefore on array": function () {
        v.TestModel.defineFields({foo: {type: 'object'}});

        var doc = new v.TestModel({_id: "123", foo: []});
        var was = {"foo.1.bar": 3};

        var old = doc.$asBefore(was);

        assert.equals(old.foo, [, {bar: 3}]);

        doc.attributes.foo = [1, {bar: 3}];

        old = doc.$asBefore({"foo.$-0": 1});
        assert.equals(old.foo, [{bar: 3}]);
      },

      "test $asChanges": function () {
        var beforeChange = {a: 1, b: 2, c: 3, "e.1.f": 42};
        var doc = new v.TestModel({_id: "1", a: 2, b: undefined, d: 4, e: [1, {f: 69}]});

        var changes = doc.$asChanges(beforeChange);

        assert.equals(changes, {a: 2, b: undefined, c: undefined, "e.1.f": 69});

        // should not alter passed in arguments
        assert.equals(beforeChange, {a: 1, b: 2, c: 3, "e.1.f": 42});
        assert.equals(doc.attributes, {_id: "1", a: 2, b: undefined, d: 4, e: [1, {f: 69}]});
      },

      "test addItem $asChanges": function () {
        var beforeChange = {"a.$-1": "a", "a.$-2": "b"};
        var doc = new v.TestModel({id: "1", a: ["x", "a", "b"]});

        var changes = doc.$asChanges(beforeChange);

        assert.equals(changes, {"a.$+1": "a", "a.$+2": "b"});
      },

      "test removeItem $asChanges": function () {
        var beforeChange = {"a.$+1": "a", "a.$+2": "b"};
        var doc = new v.TestModel({id: "1", a: ["x"]});

        var changes = doc.$asChanges(beforeChange);

        assert.equals(changes, {"a.$-1": "a", "a.$-2": "b"});
      },

      "test change": function () {
        v.TestModel.defineFields({foo: {type: 'object'}});

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

        "test belongs_to manual name": function () {
          v.TestModel.defineFields({baz_id: {type: 'belongs_to', modelName: 'Foo'}});

          var sut = v.TestModel.build({baz_id: v.foo._id});

          assert.same(sut.baz.name, "qux");
        },

        "test belongs_to manual model": function () {
          v.TestModel.defineFields({baz_id: {type: 'belongs_to', model: v.Foo}});

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

          assert.same(v.TestModel.create({user_id: 'override'}).$reload().user_id, 'override');
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

      "test $clearChanges": function () {
        var doc = new v.TestModel({_id: 't1', name: 'foo'});

        var changes = doc.changes;
        doc.$clearChanges();

        assert.same(doc.changes, changes);

        doc.changes.name = 'bar';

        doc.$clearChanges();

        refute.same(doc.changes, changes);

        assert(util.isObjEmpty(doc.changes));
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

      "put": {
        setUp: function () {
          test.stub(koru, 'userId').returns('u123');
          v.TestModel.defineFields({name: 'string', array: 'has-many', deep: 'object'});
          v.doc = v.TestModel.create({name: 'old', array: ['zero', 'three'], deep: {a: 1}});

          isClient && this.spy(session, "rpc");
        },

        "test no authorizePut": function () {
          test.stub(koru, 'info');
          assert.accessDenied(function () {
            v.doc.$put({name: 'new'});
          });
        },

        "test simple": function () {
          v.TestModel.prototype.authorizePut = test.stub();
          v.doc.$put('name', 'changed');
          assert.same(v.doc.$reload().name, 'changed');
        },

        "test authorizePut function": function () {
          v.TestModel.prototype.authorizePut = v.auth = test.stub();

          v.doc.$put({
            name: 'new',
            'array.$+1': 'one', 'array.$+2': 'two',
            'array.$-3': 'three',
            'deep.nested': {value: 123}});

          assert.equals(v.doc.changes, {});

          assert.calledWith(v.auth, 'u123', {array: {"array.$+1": "one", "array.$+2": "two", "array.$-3": "three"}, deep: {"deep.nested": {value: 123}}});
          assert.equals(v.auth.thisValues[0], TH.matchModel(v.doc));
          if (isClient) {
            assert.calledTwice(v.auth);
            assert.equals(v.auth.thisValues[1], TH.matchModel(v.doc));
            assert(v.auth.calledBefore(session.rpc));
          }

          v.doc.$reload();

          assert.same(v.doc.name, 'new');
          assert.equals(v.doc.array, ['zero', 'one', 'two']);
          assert.equals(v.doc.deep, {a: 1, nested: {value: 123}});

          assert[isClient ? 'same' : 'equals'](v.doc.attributes, v.TestModel.findById(v.doc._id).attributes);

          if(isClient)
            assert.calledOnceWith(session.rpc,'put', 'TestModel', v.doc._id, {
              name: 'new',
              'array.$+1': 'one', 'array.$+2': 'two',
              'array.$-3': 'three',
              'deep.nested': {value: 123}
            });
        },

        "test authorizePut object": function () {
          v.TestModel.prototype.authorizePut = {
            array: v.array = test.stub(),
            deep: function (doc, updates) {
              updates['deep.nested'].value = 444;
            },
          },
          v.TestModel.prototype.authorize = v.auth = test.stub();

          v.doc.$put({
            name: 'new',
            'array.$+1': 'one', 'array.$+2': 'two',
            'array.$-3': 'three',
            'deep.nested': {value: 123}});

          assert.calledWith(v.auth, 'u123', {
            put: {
              array: v.arrayUpdates = {"array.$+1": "one", "array.$+2": "two", "array.$-3": "three"},
              deep: {"deep.nested": {value: 444}}
            }
          });
          assert.equals(v.auth.thisValues[0], TH.matchModel(v.doc));
          if (isClient) {
            assert.calledTwice(v.auth);
            assert.same(v.array.callCount, 2);
            assert.equals(v.auth.thisValues[1], TH.matchModel(v.doc));
            assert(v.auth.calledBefore(session.rpc));
          }
          assert.calledWith(v.array, TH.matchModel(v.doc), v.arrayUpdates);

          v.doc.$reload();

          assert.same(v.doc.name, 'new');
          assert.equals(v.doc.array, ['zero', 'one', 'two']);
          assert.equals(v.doc.deep, {a: 1, nested: {value: 444}});
        },
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
        v.TestModel.defineFields({a: 'text', d: 'text', notme: 'text', _version: 'number'});
        var sut = new v.TestModel();


        var result = sut.$setFields(['a','d','notdefined','_id', '_version'],{
          a: 'aa',d: 'dd', notdefined: 'set', notme: 'nm', _id: 'noset', _version: 5,
        });

        assert.same(result, sut);

        assert.equals(sut.changes,{a: 'aa',d: 'dd'});

        assert.same(sut.notdefined,'set');

      },

      "test toId": function () {
        var doc = new v.TestModel({_id: 'theId'});

        assert.same(v.TestModel.toId(doc), 'theId');
        assert.same(v.TestModel.toId('astring'), 'astring');

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
