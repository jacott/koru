isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../model/test-helper');
  var session = require('./main');
  var Model = require('../model/main');
  var clientUpdate = require('./client-update');
  var publish = require('./publish');
  var message = require('./message');
  var Query = require('../model/query');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.gDict = message.newGlobalDict();
      clientUpdate(v.sess = {
        provide: test.stub(),
        _rpcs: {},
        sendBinary: v.sendBinary = test.stub(),
        state: 'ready',
        onConnect: test.stub(),
      });
      ['A', 'C', 'R'].forEach(function (type) {
        assert.calledWith(v.sess.provide, type, TH.match(function (func) {
          v['recv'+type] = function (...args) {
            func.call(v.sess, args.slice());
          };
          return true;
        }));
      });

      v.Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
      v.matchFunc = test.stub(publish.match, 'has', function (doc) {
        return doc.constructor === v.Foo &&
          v.match(doc.attributes);
      });
      v.match = function (doc) {
        return doc.name === 'bob';
      };
    },

    tearDown: function () {
      Model._destroyModel('Foo', 'drop');
      util.dbId = null;
      delete Model._databases.foo01;
      v = null;
    },

    "test isFromServer": function () {
      test.stub(Query.prototype, 'remove', function () {
        assert.isTrue(v.sess.isUpdateFromServer);
        assert.isTrue(this.isFromServer);
      });

      v.recvC('Foo', 'f123', v.attrs = {name: 'bob', age: 5});

      assert.isFalse(v.sess.isUpdateFromServer);
      assert.calledOnce(Query.prototype.remove);

      v.recvR('Foo', 'f123');

      assert.calledTwice(Query.prototype.remove);
    },

    "test added": function () {
      v.recvA('Foo', 'f123', v.attrs = {name: 'sam', age: 5});

      refute(v.Foo.findById('f123')); // only interested in bob

      var insertSpy = test.spy(Query, 'insertFromServer');
      v.recvA('Foo', 'f123', v.attrs = {name: 'bob', age: 5});

      var foo = v.Foo.findById('f123');

      assert(foo);
      v.attrs._id = 'f123';
      assert.equals(foo.attributes, v.attrs);
      assert.calledWith(insertSpy, v.Foo, 'f123', v.attrs);

      v.sess.dbId = 'foo01';
      v.recvA('Foo', 'f123', v.attrs = {name: 'bob', age: 7});

      var foo = v.Foo.findById('f123');

      assert.same(foo.age, 5);
      assert.same(v.Foo.query.withDB('foo01').fetchOne().age, 7);
    },

    "test changed": function () {
      v.Foo.create({_id: 'f222', name: 'bob', age: 5});
      var sam = v.Foo.create({_id: 'f333', name: 'sam', age: 5});

      var bob = v.Foo.docs.f222;

      bob.$cache.foo = 1;

      v.recvC('Foo', 'f222', v.attrs = {age: 7});
      v.recvC('Foo', 'f333', v.attrs = {age: 7});

      assert.same(bob._cache, null);

      assert.equals(bob.attributes, {_id: 'f222', name: 'bob', age: 7});
      assert.same(v.Foo.query.onId('f333').count(1), 0);
    },

    "test changing non existant doc": function () {
      var remove = test.spy(Query.prototype, 'remove');

      v.recvC('Foo', 'f222', v.attrs = {age: 7});
      assert.called(remove);

      assert.same(remove.firstCall.thisValue.singleId, 'f222');

    },

    "test remove": function () {
      var foo = v.Foo.create({_id: 'f222', name: 'bob', age: 5});
      var sam = v.Foo.create({_id: 'f333', name: 'sam', age: 5});

      v.recvR('Foo', 'f222');
      v.recvR('Foo', 'f333');

      refute(v.Foo.findById('f222'));
      refute(v.Foo.findById('f333')); // doesn't matter if it doesn't match; it's gone
    },
  });
});
