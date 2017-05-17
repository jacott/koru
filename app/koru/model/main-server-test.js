define(function (require, exports, module) {
  const koru       = require('koru/main');
  const dbBroker   = require('koru/model/db-broker');
  const Driver     = require('koru/pg/driver');
  const session    = require('koru/session');
  const util       = require('koru/util');
  const TH         = require('./test-helper');
  const TransQueue = require('./trans-queue');
  const Val        = require('./validation');

  const Model      = require('./main');
  var test, v;

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

    "$docCache": {
      setUp() {
        v.defDb = Driver.defaultDb;
        v.altDb = Driver.connect(v.defDb._url + " options='-c search_path=alt'", 'alt');
        v.altDb.query('CREATE SCHEMA IF NOT EXISTS alt');
      },

      tearDown() {
        if (v.altDb) {
          v.altDb.query("DROP SCHEMA IF EXISTS alt CASCADE");
          dbBroker.clearDbId();
        }
      },

      "test switching db"() {
        const TestModel = Model.define('TestModel').defineFields({
          name: 'text',
        });
        assert.same(TestModel._$docCacheGet('fooId'), undefined);
        TestModel.create({_id: 'fooId', name: 'foo'});
        assert.same(TestModel._$docCacheGet('fooId').name, 'foo');
        dbBroker.db = v.altDb;
        assert.same(TestModel._$docCacheGet('fooId'), undefined);
        dbBroker.db = v.defDb;
        assert.same(TestModel._$docCacheGet('fooId').name, 'foo');
        const future = new Future;
        koru.fiberConnWrapper(() => {
          try {
            v.ans = TestModel._$docCacheGet('fooId');
            future.return('success');
          } catch(ex) {
            future.throw(ex);
          }
        }, v.conn = {});
        assert.same(future.wait(), 'success');
        assert.same(v.ans, undefined);

      },
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
      TestModel.beforeSave(TestModel, v.beforeSave = test.stub());

      v.doc.$save();
      TestModel.query.onId(v.doc._id).update({});

      assert.same(v.doc.$reload().name, 'foo');
      refute.called (v.onChange);
      refute.called (v.beforeSave);
    },

    "test reload and caching"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});

      v.doc = TestModel.create({name: 'foo'});

      v.doc.attributes.name = 'baz';
      v.doc.name = 'bar';

      let retFut = new Future;
      let waitFut = new Future;

      util.Fiber(function () {
        try {
          while(retFut) {
            const what= retFut.wait();
            waitFut.return(what && what());
          }
        } catch(ex) {
          koru.error(util.extractError(ex));
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
      var TestModel = Model.define('TestModel').defineFields({name: 'text'});
      TestModel.overrideSave = test.stub();

      var saveSpy = test.spy(TestModel.prototype, '$save');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", "fooid", {name: 'bar'});

      assert.calledWith(TestModel.overrideSave, "fooid", {name: 'bar'}, 'u123');

      refute.called(saveSpy);
    },

    "test overrideRemove"() {
      const TestModel = Model.define('TestModel', {
        overrideRemove: v.overrideRemove = test.stub()
      }).defineFields({name: 'text'});

      const removeSpy = test.spy(TestModel.prototype, '$remove');
      const doc = TestModel.create({name: 'remove me'});

      session._rpcs.remove.call({userId: 'u123'}, "TestModel", doc._id);

      assert.calledWith(v.overrideRemove, 'u123');
      var model = v.overrideRemove.firstCall.thisValue;
      assert.same(model.constructor, TestModel);
      assert.same(model.name, 'remove me');

      refute.called(removeSpy);
    },

    "test $save with callback"() {
      const TestModel = Model.define('TestModel').defineFields({name: 'text'});
      const doc = TestModel.build({name: 'foo'});
      doc.$save({callback: v.callback = this.stub()});

      assert.calledWith(v.callback, doc);
    },

    "test saveRpc new"() {
      var TestModel = Model.define('TestModel', {
        authorize: v.auth = test.stub()
      }).defineFields({name: 'text'});


      test.spy(TestModel.db, 'transaction');
      TestModel.onChange(v.onChangeSpy = test.stub());

      assert.accessDenied(function () {
        session._rpcs.save.call({userId: null}, "TestModel", null, {_id: "fooid", name: 'bar'});
      });

      refute(TestModel.exists("fooid"));

      test.spy(Val, 'assertCheck');

      test.spy(TransQueue, 'onSuccess');
      test.spy(TransQueue, 'onAbort');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", null, {_id: "fooid", name: 'bar'});

      v.doc = TestModel.findById("fooid");

      assert.same(v.doc.name, 'bar');

      assert.calledOnce(v.onChangeSpy);

      assert(TransQueue.onAbort.calledBefore(TransQueue.onSuccess));

      TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWithExactly(v.auth, "u123");

      assert.equals(v.auth.firstCall.thisValue.attributes, v.doc.attributes);

      assert.calledWith(Val.assertCheck, null, "string", {baseName: "_id"});

      assert.calledOnce(TestModel.db.transaction);

      test.stub(TestModel, '_$docCacheDelete');
      TransQueue.onAbort.yield();
      assert.calledWith(TestModel._$docCacheDelete, TH.match.field('_id', 'fooid'));

      v.auth.reset();
      session._rpcs.save.call({userId: 'u123'}, "TestModel", null, {_id: "fooid", name: 'bar2'});

      refute.called(v.auth);
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

      test.spy(TransQueue, 'onSuccess');

      session._rpcs.save.call({userId: 'u123'}, "TestModel", v.doc._id, {name: 'bar'});

      assert.same(v.doc.$reload().name, 'bar');

      assert.calledOnce(v.onChangeSpy);
      TransQueue.onSuccess.yield();
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

      test.spy(TransQueue, 'onSuccess');

      session._rpcs.remove.call({userId: 'u123'}, "TestModel", v.doc._id);

      refute(TestModel.findById(v.doc._id));

      assert.calledOnce(v.onChangeSpy);
      TransQueue.onSuccess.yield();
      assert.calledTwice(v.onChangeSpy);
      assert.calledWith(v.auth, "u123", {remove: true});

      assert.calledTwice(TestModel.db.transaction);
    },

    "test addUniqueIndex"() {
      var TestModel = Model.define('TestModel');

      var ensureIndex = test.stub(TestModel.docs, 'ensureIndex');

      TestModel.addUniqueIndex('a', 'b', -1, 'c', 1, 'd', ignoreme=>{});

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
