isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var session = require('../session/main');
  var subscribe = require('./subscribe');
  var publish = require('./publish');
  require('./client-update');
  var Model = require('../model/main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      publish("foo", v.pubStub = test.stub());

      assert.same(publish._pubs.foo, v.pubStub);
      test.stub(session, 'sendP');
    },

    tearDown: function () {
      publish._destroy('foo');
      v.sub && v.sub.stop();
      v = null;
    },

    "test subscribe": function () {
      v.sub = subscribe('foo', 123, 456, v.stub = test.stub());

      assert.calledOnce(v.pubStub);
      assert.same(v.pubStub.thisValues[0], v.sub);


      assert.same(v.sub._id, subscribe._nextId.toString(16));
      assert.same(v.sub.callback, v.stub);
      assert.equals(v.sub.args, [123, 456]);

      session._onMessage({}, 'P'+v.sub._id);

      assert.calledWithExactly(v.stub, null);

      assert.calledWith(session.sendP, 'foo|' + v.sub._id, [123, 456]);
      assert(v.sub);

      assert.same(subscribe._subs[v.sub._id], v.sub);

      v.sub.stop();
      assert.calledWith(session.sendP, '|' + v.sub._id);

      assert.isFalse(v.sub._id in subscribe._subs);
      v.sub = null;
    },

    "test match": function () {
      var Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
      test.onEnd(function () {
        Model._destroyModel('Foo', 'drop');
      });

      v.sub = subscribe('foo');

      v.sub.match(Foo, v.match = test.stub());

      session._onMessage({}, 'AFoo|f123'+JSON.stringify(v.attrs = {name: 'bob', age: 5}));

      assert.calledWith(v.match, TH.match(function (doc) {
        return doc._id === 'f123';
      }));
    },
  });
});
