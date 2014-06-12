isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../model/test-helper');
  var session = require('./main');
  var Model = require('../model/main');
  var sut = require('./client-update');
  var publish = require('./publish');
  var message = require('./message');
  var Query = require('../model/query');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
      v.matchFunc = test.stub(publish, '_matches', function (doc) {
        return doc.constructor === v.Foo &&
          v.match(doc.attributes);
      });
      v.match = function (doc) {
        return doc.name === 'bob';
      };
    },

    tearDown: function () {
      Model._destroyModel('Foo', 'drop');
      v = null;
    },

    "test added": function () {
      session._onMessage({}, message.encodeMessage('A', ['Foo', 'f123', v.attrs = {name: 'sam', age: 5}]));

      refute(v.Foo.findById('f123'));

      var insertSpy = test.spy(Query, 'insertFromServer');
      session._onMessage({}, message.encodeMessage('A', ['Foo', 'f123', v.attrs = {name: 'bob', age: 5}]));

      var foo = v.Foo.findById('f123');

      assert(foo);
      v.attrs._id = 'f123';
      assert.equals(foo.attributes, v.attrs);
      assert.calledWith(insertSpy, v.Foo, 'f123', v.attrs);
    },

    "test changed": function () {
      var bob = v.Foo.create({_id: 'f222', name: 'bob', age: 5});
      var sam = v.Foo.create({_id: 'f333', name: 'sam', age: 5});

      var fromServerSpy = test.spy(Query.prototype, 'fromServer');

      session._onMessage({}, message.encodeMessage('C', ['Foo', 'f222', v.attrs = {age: 7}]));
      session._onMessage({}, message.encodeMessage('C', ['Foo', 'f333', v.attrs = {age: 7}]));

      assert.calledWith(fromServerSpy, 'f222');
      assert.calledWith(fromServerSpy, 'f333');

      assert.equals(bob.attributes, {_id: 'f222', name: 'bob', age: 7});
      assert.same(v.Foo.query.onId('f333').count(1), 0);
    },

    "test remove": function () {
      var foo = v.Foo.create({_id: 'f222', name: 'bob', age: 5});
      var sam = v.Foo.create({_id: 'f333', name: 'sam', age: 5});

      var fromServerSpy = test.spy(Query.prototype, 'fromServer');

      session._onMessage({}, message.encodeMessage('R', ['Foo', 'f222']));
      session._onMessage({}, message.encodeMessage('R', ['Foo', 'f333']));

      assert.calledWith(fromServerSpy, 'f222');
      assert.calledWith(fromServerSpy, 'f333');

      refute(v.Foo.findById('f222'));
      refute(v.Foo.findById('f333')); // doesn't matter if it doesn't match; it's gone
    },
  });
});
