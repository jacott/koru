define(function (require, exports, module) {
  var test, v;
  const Driver     = require('koru/pg/driver');
  const koru       = require('../main');
  const session    = require('../session/base');
  const util       = require('../util');
  const Model      = require('./main');
  const TH         = require('./test-helper');
  const TransQueue = require('./trans-queue');
  const Val        = require('./validation');

  const Future   = util.Future;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      TH.noInfo();
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      v = null;
    },

    "test auto Id"() {
      var TestModel = Model.define('TestModel');
      TestModel.defineFields({
        _id: {type: 'serial', auto: true},
        name: 'text',
      });

      TestModel.create({name: 'foo'});
      var bar = TestModel.create({name: 'bar'});
      assert.same(bar._id, 2);

      var doc = TestModel.findBy('name', 'bar');
      assert(doc);
      assert.same(doc._id, 2);
    },

    "test invalid findById"() {
      var TestModel = Model.define('TestModel');

      assert.same(TestModel.findById(null), undefined);

      assert.exception(function () {
        TestModel.findById({});
      }, 'Error', 'invalid id: [object Object]');
    },

    "test globalDictAdders"() {
      var adder = session._globalDictAdders[koru.absId(require, './main-server')];
      assert.isFunction(adder);

      var TestModel = Model.define('TestModel').defineFields({name: 'text', 'age': 'number'});

      adder(v.stub = test.stub());

      assert.calledWith(v.stub, '_id');
      assert.calledWith(v.stub, 'name');
      assert.calledWith(v.stub, 'age');
    },

    "test remote"() {
      var TestModel = Model.define('TestModel');

      TestModel.remote({foo: v.foo = test.stub().returns('result')});

      test.spy(TestModel.db, 'transaction');

      assert.accessDenied(function () {
        session._rpcs['TestModel.foo'].call({userId: null});
      });

      refute.called(v.foo);

      assert.same(session._rpcs['TestModel.foo'].call(v.conn = {userId: "uid"}, 1, 2),
                  'result');

      assert.calledOnce(v.foo);
      assert.calledWithExactly(v.foo, 1, 2);
      assert.same(v.foo.firstCall.thisValue, v.conn);

      assert.called(TestModel.db.transaction);
    },

    "test when no changes in save"() {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = TestModel.create({name: 'foo'});
      test.onEnd(TestModel.onChange(v.onChange = test.stub()));
      TestModel.beforeSave('TestModel', v.beforeSave = test.stub());

      v.doc.$save();
      TestModel.query.onId(v.doc._id).update({});

      assert.same(v.doc.$reload().name, 'foo');
      refute.called (v.onChange);
      refute.called (v.beforeSave);
    },

    "test reload and caching"() {
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = TestModel.create({name: 'foo'});

      v.doc.attributes.name = 'baz';
      v.doc.name = 'bar';

      var retFut = new Future;
      var waitFut = new Future;

      util.Fiber(function () {
        try {
          while(retFut) {
            var what= retFut.wait();
            waitFut.return(what && what());
          }
        } catch(ex) {
          waitFut.throw(ex);
        }
      }).run();

      retFut.return(function () {
        retFut = new Future;
        var doc = TestModel.findById(v.doc._id);
        doc.attributes.name = 'cache foo';
      });
      waitFut.wait();

      TestModel.docs.update({_id: v.doc._id}, {$set: {name: 'fuz'}});

      assert.same(v.doc.$reload(), v.doc);
      assert.same(v.doc.name, 'baz');
      assert.same(v.doc.$reload('full'), v.doc);
      assert.same(v.doc.name, 'fuz');

      waitFut = new Future;
      retFut.return(function () {
        retFut = null;
        return TestModel.findById(v.doc._id);
      });
      ;
      assert.same(waitFut.wait().name, 'cache foo');

      TestModel.docs.update({_id: v.doc._id}, {$set: {name: 'doz'}});
      assert.same(v.doc.$reload().name, 'fuz');
    },

    "test overrideSave"() {
      var TestModel = Model.define('TestModel', {
        overrideSave: v.overrideSave = test.stub()
      }).defineFields({name: 'text'});

      var saveSpy = test.spy(TestModel.prototype, '$save');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", "fooid", {name: 'bar'});

      assert.calledWith(v.overrideSave, 'u123');
      var model = v.overrideSave.firstCall.thisValue;
      assert.same(model.constructor, TestModel);
      assert.same(model.changes.name, 'bar');

      refute.called(saveSpy);
    },

    "test saveRpc new"() {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});


      test.spy(TestModel.db, 'transaction');
      TestModel.onChange(v.onChangeSpy = test.stub());

      assert.accessDenied(function () {
        session._rpcs.save.call({userId: null}, "TestModel", "fooid", {name: 'bar'});
      });

      refute(TestModel.exists("fooid"));

      test.spy(Val, 'assertCheck');

      var pushStub = test.spy(TransQueue, 'push');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", "fooid", {name: 'bar'});

      v.doc = TestModel.findById("fooid");

      assert.same(v.doc.name, 'bar');

      assert.calledOnce(v.onChangeSpy);
      pushStub.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);

      assert.calledWith(Val.assertCheck, "fooid", "string", {baseName: "_id"});
      assert.calledWith(Val.assertCheck, "TestModel", "string", {baseName: "modelName"});

      assert.calledOnce(TestModel.db.transaction);
    },

    "test saveRpc existing"() {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});


      v.doc = TestModel.create({name: 'foo'});

      TestModel.onChange(v.onChangeSpy = test.stub());

      assert.accessDenied(function () {
        session._rpcs.save.call({userId: null}, "TestModel", v.doc._id, {name: 'bar'});
      });

      assert.same(v.doc.$reload().name, 'foo');

      var pushStub = test.spy(TransQueue, 'push');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", v.doc._id, {name: 'bar'});

      assert.same(v.doc.$reload().name, 'bar');

      assert.calledOnce(v.onChangeSpy);
      pushStub.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);
    },

    'test removeRpc'() {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});

      test.spy(TestModel.db, 'transaction');

      v.doc = TestModel.create({name: 'foo'});

      TestModel.onChange(v.onChangeSpy = test.stub());

      assert.accessDenied(function () {
        session._rpcs.remove.call({userId: null}, "TestModel", v.doc._id);
      });

      var pushStub = test.spy(TransQueue, 'push');

      session._rpcs.remove.call({userId: 'u123'}, "TestModel", v.doc._id);

      refute(TestModel.findById(v.doc._id));

      assert.calledOnce(v.onChangeSpy);
      pushStub.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWith(v.auth, "u123", {remove: true});

      assert.calledTwice(TestModel.db.transaction);
    },

    "test addUniqueIndex"() {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addUniqueIndex('a', 'b', -1, 'c', 1, 'd');

      refute.called(ensureIndex);

      Model.ensureIndexes();

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1}, {sparse: true, unique: true});
    },

    "test addIndex"() {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addIndex('a', 'b', -1, 'c', 1, 'd');

      refute.called(ensureIndex);

      Model.ensureIndexes();

      assert.calledWith(ensureIndex, {a: 1, b: -1, c: 1, d: 1});
    },

    "test transaction"() {
      var TestModel = Model.define('TestModel');
      var stub = test.stub().returns('result');
      var tx = test.spy(TestModel.db, 'transaction');
      assert.same(TestModel.transaction(stub), 'result');

      assert.called(stub);
      assert.calledWith(tx, stub);
    },
  });
});
